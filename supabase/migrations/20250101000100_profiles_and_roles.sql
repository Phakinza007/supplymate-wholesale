create type public.user_role as enum ('customer', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where role = 'admin';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- is_admin() runs as owner (postgres), so RLS on profiles never re-evaluates
-- inside it -- this is what avoids infinite recursion (42P17). NEVER run
-- `alter table public.profiles force row level security;`, which would
-- reintroduce the recursion by applying RLS to the owner too.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Prevents a user from promoting themselves to admin via their own
-- "update own profile" policy. auth.uid() is null in SQL-editor/service_role
-- contexts, which is what lets you bootstrap the very first admin by hand.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_privileged boolean := (select auth.uid()) is null or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_privileged then
      new.role := 'customer';
    end if;
  elsif new.role is distinct from old.role and not v_privileged then
    raise exception 'not authorized to change role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, avatar_url)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), ''),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when the user changes their auth email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();

alter table public.profiles enable row level security;
-- NOTE: never FORCE row level security on this table -- see is_admin() above.

create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: admin reads all" on public.profiles for select to authenticated
  using (public.is_admin());
create policy "profiles: insert own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admin updates" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- no DELETE policy for anyone: profiles die only via auth.users cascade.
