create table public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  label          text,                       -- "Home", "Office"
  recipient_name text not null,
  phone          text not null,
  line1          text not null,
  line2          text,
  subdistrict    text,                       -- TH: tambon
  district       text,                       -- TH: amphoe
  province       text not null,
  postal_code    text not null,
  country        text not null default 'TH',
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index addresses_user_id_idx on public.addresses (user_id);
create unique index addresses_one_default_per_user
  on public.addresses (user_id) where is_default;

create trigger trg_addresses_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- "one default" is enforced by the partial unique index above; this trigger
-- makes setting a new default *demote* the old one instead of erroring.
create or replace function public.demote_other_default_addresses()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_default then
    update public.addresses
       set is_default = false
     where user_id = new.user_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

create trigger trg_addresses_single_default
  before insert or update of is_default on public.addresses
  for each row when (new.is_default) execute function public.demote_other_default_addresses();

alter table public.addresses enable row level security;

create policy "addresses: owner full access" on public.addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Deliberately NO admin policy: admins never need the live address book --
-- each order carries its own shipping_address snapshot. Least privilege.
