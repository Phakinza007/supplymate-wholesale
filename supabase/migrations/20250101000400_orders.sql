create sequence public.order_number_seq start with 1001;

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   bigint not null unique default nextval('public.order_number_seq'),
  user_id        uuid not null references public.profiles(id) on delete restrict,

  status         text not null default 'pending'
                 check (status in ('pending','verified','shipped','done','cancelled')),

  -- money (all server-computed; see create_order() / triggers below)
  subtotal       numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  shipping_fee   numeric(12,2) not null default 0 check (shipping_fee >= 0),
  total          numeric(12,2) not null default 0 check (total >= 0),

  -- fulfilment snapshot (immutable copy; address rows may later change/delete)
  address_id       uuid references public.addresses(id) on delete set null,
  shipping_address jsonb not null,
  customer_name    text not null,
  customer_phone   text not null,
  customer_email   text,
  customer_note    text,

  -- manual bank transfer
  payment_method           text not null default 'bank_transfer'
                           check (payment_method in ('bank_transfer')),
  payment_slip_path        text,
  payment_slip_uploaded_at timestamptz,
  payment_note             text,      -- transfer time / last 4 digits, typed by user
  paid_at                  timestamptz,

  -- shipping
  tracking_number  text,
  shipping_carrier text,
  shipped_at       timestamptz,

  -- lifecycle
  verified_at   timestamptz,
  verified_by   uuid references public.profiles(id) on delete set null,
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_total_identity
    check (total = subtotal - discount_total + shipping_fee),
  constraint orders_discount_within_subtotal
    check (discount_total <= subtotal)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_slip_pending_idx on public.orders (created_at desc)
  where status = 'pending' and payment_slip_path is not null;   -- admin verify queue

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  variant_id   uuid references public.product_variants(id) on delete set null,

  -- immutable snapshot; never join to products to render order history
  product_name text not null,
  product_slug text,
  variant_name text,
  sku          text,
  image_path   text,
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity > 0 and quantity <= 999),
  line_total   numeric(12,2) generated always as (round(unit_price * quantity, 2)) stored,

  created_at   timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Status transition matrix, enforced in the DB (not the app layer) because
-- the browser talks to PostgREST directly with the user's own JWT -- an
-- app-layer-only check is a UI affordance, not enforcement.
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'pending'   then array['verified','cancelled']
    when 'verified'  then array['shipped','pending','cancelled'] -- 'pending' = slip rejected
    when 'shipped'   then array['done','cancelled']
    when 'done'      then array[]::text[]
    when 'cancelled' then array[]::text[]
  end;

  if not (new.status = any (v_allowed)) then
    raise exception 'invalid order status transition: % -> %', old.status, new.status
      using errcode = '23514', hint = 'allowed: ' || coalesce(array_to_string(v_allowed, ', '), 'none');
  end if;

  -- lifecycle timestamps are derived, never client-set
  new.verified_at  := case when new.status = 'verified'  then now() else old.verified_at end;
  new.verified_by  := case when new.status = 'verified'  then (select auth.uid()) else old.verified_by end;
  new.paid_at      := case when new.status = 'verified' and old.paid_at is null then now() else old.paid_at end;
  new.shipped_at   := case when new.status = 'shipped'   then now() else old.shipped_at end;
  new.completed_at := case when new.status = 'done'      then now() else old.completed_at end;
  new.cancelled_at := case when new.status = 'cancelled' then now() else old.cancelled_at end;

  return new;
end;
$$;

create trigger trg_orders_status_transition
  before update of status on public.orders
  for each row execute function public.enforce_order_status_transition();

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer                   -- required: order_status_history has no INSERT policy
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()));
  end if;
  return null;
end;
$$;

create trigger trg_orders_status_log
  after insert or update of status on public.orders
  for each row execute function public.log_order_status_change();

-- Fences off the financial core of a placed order. Admins hold UPDATE on
-- orders (for status changes), so this trigger silently coerces any other
-- field back to its old value rather than trusting a round-tripped PATCH.
-- Money (discount/shipping) stays editable only while status = 'pending'.
create or replace function public.enforce_order_immutability()
returns trigger
language plpgsql
as $$
begin
  new.id           := old.id;
  new.order_number := old.order_number;
  new.user_id      := old.user_id;
  new.created_at   := old.created_at;
  new.subtotal     := old.subtotal;   -- only create_order() sets this
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

create trigger trg_orders_immutable
  before update on public.orders
  for each row execute function public.enforce_order_immutability();

alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;

create policy "orders: read own" on public.orders for select to authenticated
  using (user_id = (select auth.uid()));
create policy "orders: admin reads all" on public.orders for select to authenticated
  using (public.is_admin());
create policy "orders: admin updates" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- NO insert policy for anyone  -> orders can only be created by
--   public.create_order() (SECURITY DEFINER, see next migration).
-- NO delete policy for anyone  -> orders are never deleted; 'cancelled' is a status.
-- NO user update policy        -> slip upload goes through attach_payment_slip().

create policy "order_items: read own" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and o.user_id = (select auth.uid())));
create policy "order_items: admin reads all" on public.order_items for select to authenticated
  using (public.is_admin());
-- NO insert/update/delete policy for anyone -> written only by create_order().

create policy "order_status_history: read own" on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and o.user_id = (select auth.uid())));
create policy "order_status_history: admin reads all" on public.order_status_history for select to authenticated
  using (public.is_admin());
-- NO write policy for anyone -> written only by log_order_status_change().
