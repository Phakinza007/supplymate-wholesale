-- Wholesale quantity price breaks. The applicable tier is the one with the
-- highest min_quantity that is still <= the quantity ordered; with no
-- qualifying tier, products.price applies.
create table public.product_price_tiers (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  min_quantity integer not null check (min_quantity >= 1),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  created_at   timestamptz not null default now(),
  unique (product_id, min_quantity)
);
create index product_price_tiers_product_idx
  on public.product_price_tiers (product_id, min_quantity);

-- Two rules that need a cross-row or cross-table read, so they can't be
-- plain CHECK constraints. Both mirror Shopify B2B's documented behaviour.
create or replace function public.enforce_price_tier_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_min_order integer;
  v_count     integer;
begin
  select min_order_quantity into v_min_order
    from public.products where id = new.product_id;
  if v_min_order is null then
    raise exception 'product not found' using errcode = '23503';
  end if;

  -- A tier at or below the MOQ is unreachable: every order already starts
  -- at the MOQ, so such a tier would silently replace the base price.
  if new.min_quantity <= v_min_order then
    raise exception
      'price tier quantity (%) must be greater than the product minimum order quantity (%)',
      new.min_quantity, v_min_order using errcode = '22023';
  end if;

  select count(*) into v_count
    from public.product_price_tiers
   where product_id = new.product_id
     and id is distinct from new.id;
  if v_count >= 10 then
    raise exception 'a product can have at most 10 price tiers' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_price_tiers_rules
  before insert or update on public.product_price_tiers
  for each row execute function public.enforce_price_tier_rules();

alter table public.product_price_tiers enable row level security;

create policy "product_price_tiers: public read" on public.product_price_tiers
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "product_price_tiers: admin write" on public.product_price_tiers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Replace create_order() so the tier is resolved SERVER-SIDE. Same signature
-- as 20260807000100_supplymate_wholesale.sql; the only change is the
-- unit_price expression in the _cart temp table. The client still sends only
-- {product_id, variant_id, quantity}, so a tampered cart cannot express a
-- price -- and a variant price_override still wins over any product-level
-- tier, because an override is an explicit per-variant price.
create or replace function public.create_order(
  p_items            jsonb,
  p_address_id       uuid    default null,
  p_shipping_address jsonb   default null,
  p_note             text    default null,
  p_promo_code       text    default null,
  p_business_details jsonb   default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_addr          public.addresses%rowtype;
  v_ship          jsonb;
  v_name          text;
  v_phone         text;
  v_business_name text;
  v_tax_id        text;
  v_branch_name   text;
  v_subtotal      numeric(12,2);
  v_shipping      numeric(12,2);
  v_discount      numeric(12,2) := 0;
  v_promo         public.promotions%rowtype;
  v_order         public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;
  if p_business_details is not null and jsonb_typeof(p_business_details) <> 'object' then
    raise exception 'business details must be a JSON object' using errcode = '22023';
  end if;

  v_business_name := nullif(trim(p_business_details->>'business_name'), '');
  v_tax_id        := nullif(trim(p_business_details->>'tax_id'), '');
  v_branch_name   := nullif(trim(p_business_details->>'branch_name'), '');

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
    coalesce(
      v.price_override,
      (select t.unit_price
         from public.product_price_tiers t
        where t.product_id = p.id
          and t.min_quantity <= i.quantity
        order by t.min_quantity desc
        limit 1),
      p.price
    )::numeric(12,2)                              as unit_price,
    i.quantity
  from jsonb_to_recordset(p_items) as i(product_id uuid, variant_id uuid, quantity integer)
  join public.products p on p.id = i.product_id and p.is_active
  left join public.product_variants v
         on v.id = i.variant_id and v.product_id = p.id and v.is_active
  where i.quantity >= p.min_order_quantity
    and (i.variant_id is null or v.id is not null)
  for no key update of p;

  if (select count(*) from _cart) <> jsonb_array_length(p_items) then
    raise exception 'one or more items are unavailable' using errcode = '22023';
  end if;
  -- stock-automation module hooks in here: check + decrement stock_quantity.

  select coalesce(sum(round(unit_price * quantity, 2)), 0) into v_subtotal from _cart;
  v_shipping := public.calc_shipping_fee(v_subtotal);

  if p_promo_code is not null then
    select * into v_promo from public.promotions
     where upper(code) = upper(p_promo_code)
     for update;

    if not found
       or not v_promo.is_active
       or (v_promo.expires_at is not null and v_promo.expires_at < now())
       or (v_promo.max_uses is not null and v_promo.uses_count >= v_promo.max_uses)
       or (v_promo.min_subtotal is not null and v_subtotal < v_promo.min_subtotal)
    then
      raise exception 'promo code is invalid or no longer available' using errcode = '22023';
    end if;

    v_discount := least(
      case
        when v_promo.discount_type = 'percent' then round(v_subtotal * v_promo.discount_value / 100, 2)
        else v_promo.discount_value
      end,
      v_subtotal
    );

    update public.promotions set uses_count = uses_count + 1 where id = v_promo.id;
  end if;

  insert into public.orders (
    user_id, address_id, shipping_address, customer_name, customer_phone, customer_email,
    customer_note, subtotal, discount_total, shipping_fee, total, promo_code,
    business_name, tax_id, branch_name
  ) values (
    v_uid, p_address_id, v_ship, v_name, v_phone,
    (select email from public.profiles where id = v_uid),
    p_note, v_subtotal, v_discount, v_shipping, v_subtotal - v_discount + v_shipping,
    case when p_promo_code is not null then upper(p_promo_code) else null end,
    v_business_name, v_tax_id, v_branch_name
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

revoke execute on function public.create_order(jsonb, uuid, jsonb, text, text, jsonb)
  from public, anon;
grant execute on function public.create_order(jsonb, uuid, jsonb, text, text, jsonb)
  to authenticated;
