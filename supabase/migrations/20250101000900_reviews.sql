create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_id_idx on public.reviews (product_id) where is_active;

create trigger trg_reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

create policy "reviews: read" on public.reviews for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "reviews: admin insert" on public.reviews for insert to authenticated
  with check (public.is_admin());
create policy "reviews: admin update" on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "reviews: admin delete" on public.reviews for delete to authenticated
  using (public.is_admin());

-- The only way a customer review gets written -- validates the caller
-- actually has a `done` order containing this product before allowing the
-- write, then upserts on (product_id, user_id) so re-reviewing edits the
-- existing row instead of creating a duplicate. Mirrors create_order()'s
-- SECURITY DEFINER + explicit grant pattern.
create or replace function public.submit_review(
  p_product_id uuid,
  p_rating     smallint,
  p_comment    text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_review public.reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.user_id = v_uid
       and o.status = 'done'
       and oi.product_id = p_product_id
  ) then
    raise exception 'you can only review products you have purchased' using errcode = '42501';
  end if;

  insert into public.reviews (product_id, user_id, rating, comment)
  values (p_product_id, v_uid, p_rating, p_comment)
  on conflict (product_id, user_id)
  do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into v_review;

  return v_review;
end;
$$;

revoke execute on function public.submit_review(uuid, smallint, text) from public, anon;
grant  execute on function public.submit_review(uuid, smallint, text) to authenticated;
