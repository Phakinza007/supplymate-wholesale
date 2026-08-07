create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_subtotal   numeric(12,2) check (min_subtotal is null or min_subtotal >= 0),
  max_uses       integer check (max_uses is null or max_uses > 0),
  uses_count     integer not null default 0,
  expires_at     timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index promotions_code_unique_idx on public.promotions (upper(code));

-- A percent code above 100 would let validate_promo_code()/create_order() compute a
-- discount larger than the subtotal; the least(...) clamp in both functions already
-- prevents that from ever landing on an order, but this constraint stops the bad row
-- from being creatable in the first place (the admin form's `max` is a UX hint only).
alter table public.promotions add constraint promotions_percent_within_range
  check (discount_type <> 'percent' or discount_value <= 100);

create trigger trg_promotions_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;

create policy "promotions: admin read" on public.promotions for select to authenticated
  using (public.is_admin());
create policy "promotions: admin insert" on public.promotions for insert to authenticated
  with check (public.is_admin());
create policy "promotions: admin update" on public.promotions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "promotions: admin delete" on public.promotions for delete to authenticated
  using (public.is_admin());

alter table public.orders add column promo_code text;

-- promo_code joins the always-locked field list (unconditional, unlike
-- discount_total/shipping_fee which stay pending-mutable for other reasons
-- this migration doesn't touch) -- a promo is set once at creation and must
-- never be attachable or swappable afterward, at any order status.
create or replace function public.enforce_order_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.id           := old.id;
  new.order_number := old.order_number;
  new.user_id      := old.user_id;
  new.created_at   := old.created_at;
  new.subtotal     := old.subtotal;
  new.shipping_address := old.shipping_address;
  new.customer_name    := old.customer_name;
  new.customer_phone   := old.customer_phone;
  new.promo_code       := old.promo_code;

  if old.status <> 'pending' then
    new.discount_total := old.discount_total;
    new.shipping_fee   := old.shipping_fee;
  end if;

  new.total := new.subtotal - new.discount_total + new.shipping_fee;
  return new;
end;
$$;

-- Read-only check for live checkout UI feedback -- never mutates uses_count.
-- create_order() re-validates every one of these conditions itself; this
-- function's result is never trusted at order-creation time.
create or replace function public.validate_promo_code(
  p_code     text,
  p_subtotal numeric
)
returns table (
  valid           boolean,
  reason          text,
  discount_type   text,
  discount_value  numeric,
  discount_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo public.promotions%rowtype;
begin
  select * into v_promo from public.promotions where upper(code) = upper(p_code);

  if not found then
    return query select false, 'code not found', null::text, null::numeric, null::numeric;
    return;
  end if;
  if not v_promo.is_active then
    return query select false, 'code is no longer active', null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at < now() then
    return query select false, 'code has expired', null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_promo.max_uses is not null and v_promo.uses_count >= v_promo.max_uses then
    return query select false,
      'code has reached its usage limit', null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_promo.min_subtotal is not null and p_subtotal < v_promo.min_subtotal then
    return query select false,
      format('order must be at least %s', v_promo.min_subtotal), null::text, null::numeric, null::numeric;
    return;
  end if;

  return query select
    true, null::text, v_promo.discount_type, v_promo.discount_value,
    least(
      case
        when v_promo.discount_type = 'percent' then round(p_subtotal * v_promo.discount_value / 100, 2)
        else v_promo.discount_value
      end,
      p_subtotal
    );
end;
$$;

revoke execute on function public.validate_promo_code(text, numeric) from public, anon;
grant  execute on function public.validate_promo_code(text, numeric) to authenticated;

-- create_order() gains a trailing p_promo_code parameter. This CHANGES THE
-- OVERLOAD SIGNATURE (create or replace only replaces a function with the
-- exact same parameter list) -- the drop below is required so the old
-- 4-parameter overload doesn't linger alongside this new 5-parameter one.
drop function if exists public.create_order(jsonb, uuid, jsonb, text);

create or replace function public.create_order(
  p_items            jsonb,
  p_address_id       uuid    default null,
  p_shipping_address jsonb   default null,
  p_note             text    default null,
  p_promo_code       text    default null
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
  v_discount numeric(12,2) := 0;
  v_promo    public.promotions%rowtype;
  v_order    public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;

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
    coalesce(v.price_override, p.price)::numeric(12,2)           as unit_price,
    i.quantity
  from jsonb_to_recordset(p_items) as i(product_id uuid, variant_id uuid, quantity integer)
  join public.products p on p.id = i.product_id and p.is_active
  left join public.product_variants v
         on v.id = i.variant_id and v.product_id = p.id and v.is_active
  where i.quantity > 0
    and (i.variant_id is null or v.id is not null)
  for no key update of p;

  if (select count(*) from _cart) <> jsonb_array_length(p_items) then
    raise exception 'one or more items are unavailable' using errcode = '22023';
  end if;
  -- stock-automation module hooks in here: check + decrement stock_quantity.

  select coalesce(sum(round(unit_price * quantity, 2)), 0) into v_subtotal from _cart;
  v_shipping := public.calc_shipping_fee(v_subtotal);

  -- Apply and re-validate the promo code SERVER-SIDE -- never trust the
  -- client's earlier validate_promo_code() response. Locks the promotion
  -- row so a max_uses check+increment can't race a concurrent checkout.
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
    customer_note, subtotal, discount_total, shipping_fee, total, promo_code
  ) values (
    v_uid, p_address_id, v_ship, v_name, v_phone,
    (select email from public.profiles where id = v_uid),
    p_note, v_subtotal, v_discount, v_shipping, v_subtotal - v_discount + v_shipping,
    case when p_promo_code is not null then upper(p_promo_code) else null end
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

revoke execute on function public.create_order(jsonb, uuid, jsonb, text, text) from public, anon;
grant  execute on function public.create_order(jsonb, uuid, jsonb, text, text) to authenticated;
