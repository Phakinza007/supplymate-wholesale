-- VAT. Catalogue prices are VAT-exclusive, so tax is added on top at order
-- time rather than being carried inside every price.
--
-- Base = subtotal - discount_total + shipping_fee. Discounts reduce the taxable
-- amount; delivery is part of the taxable supply.
--
-- Existing orders keep vat_total = 0 and stay valid under the new constraint.
-- They are NOT backfilled: they were placed when the shop charged no VAT, and
-- rewriting them would falsify what the buyer actually agreed to pay.

-- EDIT PER CLIENT: 7% VAT, the standard Thai rate. A shop that is not
-- VAT-registered returns 0 here and every total below collapses to the old
-- arithmetic with no other change.
create or replace function public.calc_vat(p_base numeric)
returns numeric
language sql
immutable
as $$
  select round(greatest(p_base, 0) * 0.07, 2)::numeric(12,2);
$$;

alter table public.orders
  add column vat_total numeric(12,2) not null default 0 check (vat_total >= 0);

-- The identity constraint is `orders_total_identity`, declared by name in
-- 20250101000400_orders.sql. `orders_total_check` is Postgres's auto-generated
-- name for the inline `check (total >= 0)` on the column — a different rule
-- that must stay exactly as it is.
alter table public.orders
  drop constraint orders_total_identity,
  add constraint orders_total_identity
    check (total = subtotal - discount_total + shipping_fee + vat_total);

drop function if exists public.create_order(jsonb, uuid, jsonb, text, text, jsonb, text);

create or replace function public.create_order(
  p_items            jsonb,
  p_address_id       uuid    default null,
  p_shipping_address jsonb   default null,
  p_note             text    default null,
  p_promo_code       text    default null,
  p_business_details jsonb   default null,
  p_payment_method   text    default 'bank_transfer'
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
  v_vat           numeric(12,2);
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
  -- Checked here as well as by the column's CHECK: a clear message beats a
  -- constraint violation, and the set must stay in step with the constraint.
  if p_payment_method not in ('bank_transfer', 'promptpay') then
    raise exception 'unsupported payment method' using errcode = '22023';
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

  -- VAT is charged on the discounted goods plus delivery, and added on top:
  -- catalogue prices are VAT-exclusive.
  v_vat := public.calc_vat(v_subtotal - v_discount + v_shipping);

  insert into public.orders (
    user_id, address_id, shipping_address, customer_name, customer_phone, customer_email,
    customer_note, subtotal, discount_total, shipping_fee, vat_total, total, promo_code,
    business_name, tax_id, branch_name, payment_method
  ) values (
    v_uid, p_address_id, v_ship, v_name, v_phone,
    (select email from public.profiles where id = v_uid),
    p_note, v_subtotal, v_discount, v_shipping, v_vat,
    v_subtotal - v_discount + v_shipping + v_vat,
    case when p_promo_code is not null then upper(p_promo_code) else null end,
    v_business_name, v_tax_id, v_branch_name, p_payment_method
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



revoke execute on function public.create_order(jsonb, uuid, jsonb, text, text, jsonb, text)
  from public, anon;
grant execute on function public.create_order(jsonb, uuid, jsonb, text, text, jsonb, text)
  to authenticated;

-- The recomputed total must include VAT, and once an order leaves `pending`
-- the tax is as settled as the discount and the shipping it was derived from.
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
  new.business_name    := old.business_name;
  new.tax_id           := old.tax_id;
  new.branch_name      := old.branch_name;
  new.payment_method   := old.payment_method;

  if old.status <> 'pending' then
    new.discount_total := old.discount_total;
    new.shipping_fee   := old.shipping_fee;
    new.vat_total      := old.vat_total;
  end if;

  new.total := new.subtotal - new.discount_total + new.shipping_fee + new.vat_total;
  return new;
end;
$$;
