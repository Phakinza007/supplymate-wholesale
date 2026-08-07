-- 1. Pin search_path on functions that were missing it (function_search_path_mutable).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'pending'   then array['verified','cancelled']
    when 'verified'  then array['shipped','pending','cancelled']
    when 'shipped'   then array['done','cancelled']
    when 'done'      then array[]::text[]
    when 'cancelled' then array[]::text[]
  end;

  if not (new.status = any (v_allowed)) then
    raise exception 'invalid order status transition: % -> %', old.status, new.status
      using errcode = '23514', hint = 'allowed: ' || coalesce(array_to_string(v_allowed, ', '), 'none');
  end if;

  new.verified_at  := case when new.status = 'verified'  then now() else old.verified_at end;
  new.verified_by  := case when new.status = 'verified'  then (select auth.uid()) else old.verified_by end;
  new.paid_at      := case when new.status = 'verified' and old.paid_at is null then now() else old.paid_at end;
  new.shipped_at   := case when new.status = 'shipped'   then now() else old.shipped_at end;
  new.completed_at := case when new.status = 'done'      then now() else old.completed_at end;
  new.cancelled_at := case when new.status = 'cancelled' then now() else old.cancelled_at end;

  return new;
end;
$$;

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

  if old.status <> 'pending' then
    new.discount_total := old.discount_total;
    new.shipping_fee   := old.shipping_fee;
  end if;

  new.total := new.subtotal - new.discount_total + new.shipping_fee;
  return new;
end;
$$;

create or replace function public.calc_shipping_fee(p_subtotal numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_subtotal >= 1000 then 0::numeric(12,2) else 50::numeric(12,2) end;
$$;

-- 2. These functions exist only to be fired as triggers -- trigger firing
-- does not require an EXECUTE grant, so revoke direct-RPC callability
-- (anon_security_definer_function_executable / authenticated_...).
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.demote_other_default_addresses() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.log_order_status_change() from public, anon, authenticated;
revoke execute on function public.assert_order_totals() from public, anon, authenticated;

-- 3. product-images is a PUBLIC bucket, so Supabase serves objects at
-- /storage/v1/object/public/... without needing any SELECT policy at all.
-- The broad "public read" policy below only added the ability to LIST/query
-- storage.objects for the bucket via the API, which isn't needed and leaks
-- the full file listing. Replace with an admin-only listing policy.
drop policy "product-images: public read" on storage.objects;
create policy "product-images: admin list" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- 4. Missing FK indexes (INFO-level, cheap to add).
create index order_items_variant_id_idx on public.order_items (variant_id);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index orders_address_id_idx on public.orders (address_id);
create index orders_verified_by_idx on public.orders (verified_by);

-- 5. Multiple permissive SELECT/UPDATE policies for the same role+action force
-- Postgres to evaluate every one of them per row. Merge public-read +
-- admin-read into a single SELECT policy per table, and split the old
-- admin "FOR ALL" policies into INSERT/UPDATE/DELETE only.

-- categories
drop policy "categories: public read" on public.categories;
drop policy "categories: admin write" on public.categories;
create policy "categories: read" on public.categories for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "categories: admin insert" on public.categories for insert to authenticated
  with check (public.is_admin());
create policy "categories: admin update" on public.categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "categories: admin delete" on public.categories for delete to authenticated
  using (public.is_admin());

-- products
drop policy "products: public read" on public.products;
drop policy "products: admin write" on public.products;
create policy "products: read" on public.products for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "products: admin insert" on public.products for insert to authenticated
  with check (public.is_admin());
create policy "products: admin update" on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "products: admin delete" on public.products for delete to authenticated
  using (public.is_admin());

-- product_images
drop policy "product_images: public read" on public.product_images;
drop policy "product_images: admin write" on public.product_images;
create policy "product_images: read" on public.product_images for select to anon, authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );
create policy "product_images: admin insert" on public.product_images for insert to authenticated
  with check (public.is_admin());
create policy "product_images: admin update" on public.product_images for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "product_images: admin delete" on public.product_images for delete to authenticated
  using (public.is_admin());

-- product_variants
drop policy "product_variants: public read" on public.product_variants;
drop policy "product_variants: admin write" on public.product_variants;
create policy "product_variants: read" on public.product_variants for select to anon, authenticated
  using (
    public.is_admin()
    or (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active))
  );
create policy "product_variants: admin insert" on public.product_variants for insert to authenticated
  with check (public.is_admin());
create policy "product_variants: admin update" on public.product_variants for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "product_variants: admin delete" on public.product_variants for delete to authenticated
  using (public.is_admin());

-- profiles
drop policy "profiles: read own" on public.profiles;
drop policy "profiles: admin reads all" on public.profiles;
drop policy "profiles: update own" on public.profiles;
drop policy "profiles: admin updates" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy "profiles: update" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- orders
drop policy "orders: read own" on public.orders;
drop policy "orders: admin reads all" on public.orders;
create policy "orders: read" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- order_items
drop policy "order_items: read own" on public.order_items;
drop policy "order_items: admin reads all" on public.order_items;
create policy "order_items: read" on public.order_items for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

-- order_status_history
drop policy "order_status_history: read own" on public.order_status_history;
drop policy "order_status_history: admin reads all" on public.order_status_history;
create policy "order_status_history: read" on public.order_status_history for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );
