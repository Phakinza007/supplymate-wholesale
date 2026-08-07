-- EDIT PER CLIENT: flat 50 THB, free over 1,000 THB.
create or replace function public.calc_shipping_fee(p_subtotal numeric)
returns numeric
language sql
immutable
as $$
  select case when p_subtotal >= 1000 then 0::numeric(12,2) else 50::numeric(12,2) end;
$$;

-- Deferred constraint trigger: asserts at COMMIT that orders.subtotal always
-- equals the sum of its order_items. Deferred is what makes it work, since
-- create_order() inserts the order row and its items in separate statements.
create or replace function public.assert_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_sum      numeric(12,2);
  v_subtotal numeric(12,2);
begin
  select coalesce(sum(line_total), 0) into v_sum
    from public.order_items where order_id = v_order_id;
  select subtotal into v_subtotal
    from public.orders where id = v_order_id;

  if v_subtotal is null then          -- order was deleted in the same tx
    return null;
  end if;
  if v_sum <> v_subtotal then
    raise exception 'order % subtotal (%) does not match its items (%)',
      v_order_id, v_subtotal, v_sum using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger trg_order_items_totals_consistent
  after insert or update or delete on public.order_items
  deferrable initially deferred
  for each row execute function public.assert_order_totals();

-- The only way an order gets created. Prices are read from products/
-- product_variants inside the transaction -- the client sends only
-- {product_id, variant_id, quantity}, never a price, so a tampered
-- localStorage cart cannot express a price.
create or replace function public.create_order(
  p_items            jsonb,                  -- [{"product_id":"…","variant_id":null,"quantity":2}]
  p_address_id       uuid    default null,
  p_shipping_address jsonb   default null,   -- used when p_address_id is null
  p_note             text    default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_addr     public.addresses%rowtype;
  v_ship     jsonb;
  v_name     text;
  v_phone    text;
  v_subtotal numeric(12,2);
  v_shipping numeric(12,2);
  v_order    public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;

  -- 1. resolve the shipping snapshot (address must belong to the caller)
  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
    if not found then
      raise exception 'address not found' using errcode = '42501';
    end if;
    v_ship  := to_jsonb(v_addr) - 'user_id' - 'created_at' - 'updated_at' - 'is_default';
    v_name  := v_addr.recipient_name;
    v_phone := v_addr.phone;
  else
    if p_shipping_address is null then
      raise exception 'shipping address required' using errcode = '22023';
    end if;
    v_ship  := p_shipping_address;
    v_name  := coalesce(p_shipping_address->>'recipient_name', '');
    v_phone := coalesce(p_shipping_address->>'phone', '');
    if v_name = '' or v_phone = '' then
      raise exception 'recipient name and phone are required' using errcode = '22023';
    end if;
  end if;

  -- 2. price the cart SERVER-SIDE (row-lock for the future stock-automation module)
  create temporary table _cart on commit drop as
  select
    p.id                                          as product_id,
    v.id                                          as variant_id,
    p.name                                        as product_name,
    p.slug                                        as product_slug,
    v.name                                        as variant_name,
    coalesce(v.sku, p.sku)                        as sku,
    (select pi.storage_path from public.product_images pi
      where pi.product_id = p.id order by pi.sort_order limit 1) as image_path,
    coalesce(v.price_override, p.price)::numeric(12,2)           as unit_price,
    i.quantity
  from jsonb_to_recordset(p_items) as i(product_id uuid, variant_id uuid, quantity integer)
  join public.products p on p.id = i.product_id and p.is_active
  left join public.product_variants v
         on v.id = i.variant_id and v.product_id = p.id and v.is_active
  where i.quantity > 0
  for no key update of p;

  if (select count(*) from _cart) <> jsonb_array_length(p_items) then
    raise exception 'one or more items are unavailable' using errcode = '22023';
  end if;
  -- stock-automation module hooks in here: check + decrement stock_quantity.

  select coalesce(sum(round(unit_price * quantity, 2)), 0) into v_subtotal from _cart;
  v_shipping := public.calc_shipping_fee(v_subtotal);

  -- 3. write the order with final, server-computed money
  insert into public.orders (
    user_id, address_id, shipping_address, customer_name, customer_phone, customer_email,
    customer_note, subtotal, discount_total, shipping_fee, total
  ) values (
    v_uid, p_address_id, v_ship, v_name, v_phone,
    (select email from public.profiles where id = v_uid),
    p_note, v_subtotal, 0, v_shipping, v_subtotal + v_shipping
  ) returning * into v_order;

  insert into public.order_items (
    order_id, product_id, variant_id, product_name, product_slug,
    variant_name, sku, image_path, unit_price, quantity
  )
  select v_order.id, product_id, variant_id, product_name, product_slug,
         variant_name, sku, image_path, unit_price, quantity
    from _cart;

  return v_order;
end;
$$;

revoke execute on function public.create_order(jsonb, uuid, jsonb, text) from public, anon;
grant  execute on function public.create_order(jsonb, uuid, jsonb, text) to authenticated;

-- Attaches an uploaded slip to a pending order. The path must live under
-- the caller's own storage folder, which is what stops a user pointing
-- someone else's order at a slip they don't own.
create or replace function public.attach_payment_slip(
  p_order_id uuid,
  p_path     text,
  p_note     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_order public.orders%rowtype;
begin
  if p_path is null or p_path not like (v_uid::text || '/' || p_order_id::text || '/%') then
    raise exception 'invalid payment slip path' using errcode = '42501';
  end if;

  update public.orders
     set payment_slip_path        = p_path,
         payment_slip_uploaded_at = now(),
         payment_note             = coalesce(p_note, payment_note)
   where id = p_order_id
     and user_id = v_uid
     and status = 'pending'
  returning * into v_order;

  if not found then
    raise exception 'order not found or no longer awaiting payment' using errcode = '42501';
  end if;
  return v_order;
end;
$$;

revoke execute on function public.attach_payment_slip(uuid, text, text) from public, anon;
grant  execute on function public.attach_payment_slip(uuid, text, text) to authenticated;
