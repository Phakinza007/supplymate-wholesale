create extension if not exists pg_trgm with schema extensions;
-- gen_random_uuid() is in pg_catalog on PG13+; no pgcrypto needed on Supabase.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
