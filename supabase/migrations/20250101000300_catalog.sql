create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete set null,
  slug        text not null unique,
  name        text not null,
  description text,
  image_path  text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is distinct from id)
);
create index categories_parent_id_idx on public.categories (parent_id);
create index categories_active_sort_idx on public.categories (is_active, sort_order);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid references public.categories(id) on delete set null,
  slug             text not null unique,
  name             text not null,
  description      text,
  price            numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  sku              text unique,
  stock_quantity   integer not null default 0 check (stock_quantity >= 0),
  track_inventory  boolean not null default true,
  has_variants     boolean not null default false,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);
create index products_active_created_idx on public.products (created_at desc) where is_active;
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt          text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index product_images_product_sort_idx on public.product_images (product_id, sort_order);

-- Phase 2 (variants module). Created now, left empty: retrofitting a
-- variant_id onto order_items later would be a breaking migration, so the
-- table exists up front even though the UI to manage it ships later.
-- products.price/stock_quantity always stay the base values; a variant only
-- overrides them, so enabling this module never rewrites existing products.
create table public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  name           text not null,                       -- "Black / M"
  sku            text unique,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  options        jsonb not null default '{}'::jsonb,  -- {"color":"black","size":"M"}
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);

create trigger trg_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger trg_product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_images   enable row level security;
alter table public.product_variants enable row level security;

create policy "categories: public read" on public.categories for select to anon, authenticated
  using (is_active);
create policy "categories: admin write" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "products: public read" on public.products for select to anon, authenticated
  using (is_active);
create policy "products: admin write" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "product_images: public read" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "product_images: admin write" on public.product_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "product_variants: public read" on public.product_variants for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "product_variants: admin write" on public.product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
