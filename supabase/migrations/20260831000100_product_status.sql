-- Product lifecycle: draft (still being entered) -> active (on sale) ->
-- archived (withdrawn from sale, order history kept).
--
-- `is_active` is deliberately KEPT rather than replaced. The partial index
-- products_active_created_idx, the "products: public read" policy and the
-- "product_images: public read" policy's EXISTS subquery all read it, and
-- converting it to a GENERATED column needs DROP ... CASCADE, which would
-- take those policies with it. A BEFORE trigger derives it instead, so
-- `status` is the only writable source of truth and every existing read
-- path keeps working. Same shape as enforce_order_status_transition
-- deriving verified_at/shipped_at/cancelled_at from orders.status.
alter table public.products
  add column status text not null default 'active'
    check (status in ('draft', 'active', 'archived'));

-- Backfill BEFORE the trigger exists, so this UPDATE is not rewritten by it.
-- An existing is_active = false row meant "withdrawn from sale", which is
-- archived. Draft means "not finished being entered", which no existing row
-- can be.
update public.products set status = 'archived' where not is_active;

create or replace function public.sync_product_is_active()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;

create trigger trg_products_sync_is_active
  before insert or update on public.products
  for each row execute function public.sync_product_is_active();

create index products_status_sort_idx on public.products (status, sort_order);
