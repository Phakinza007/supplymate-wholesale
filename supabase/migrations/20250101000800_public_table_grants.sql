-- The local Supabase CLI stack's bootstrap only auto-grants table privileges
-- to anon/authenticated for objects created by `supabase_admin` -- see the
-- bootstrap's `alter default privileges in schema public grant all on
-- tables to ...`,
-- which (having no `for role` clause) applies only `for role
-- supabase_admin`, the role that ran it. Every migration in this project
-- creates tables as `postgres` (the role `supabase db reset`/`db push` runs
-- as), which has no equivalent default-privilege rule, so every table here
-- was missing the underlying GRANT the whole time -- RLS policies alone
-- were never enough. Without this, every PostgREST call against any table
-- above returns `42501 permission denied for table ...` regardless of RLS,
-- since Postgres checks table-level privileges before RLS is ever
-- evaluated. This was never caught pre-Step-8 because nothing had run the
-- migrations against a live Postgres and exercised them through PostgREST
-- until this E2E suite did. Hosted projects appear to already have
-- equivalent privileges in place by default (unverified from this
-- environment -- every pre-Step-8 manual verification round ran fine
-- against a hosted project on these same migrations, which is only
-- possible if hosted already grants these), which is why the bug stayed
-- invisible until a local `supabase db reset` was actually run for the
-- first time, here in Step 8.
--
-- Table privileges are intentionally broad here (mirroring what
-- `supabase_admin`-owned objects already get for free) -- each table's own
-- RLS policies remain the real gate on which rows/operations are actually
-- allowed; this migration only unblocks the privilege check that happens
-- before RLS is evaluated at all. `service_role` is included alongside
-- `authenticated` so a future Edge Function or server-side script using the
-- service key doesn't hit a confusing `42501` here -- `service_role`
-- normally bypasses RLS entirely, which would otherwise be the last thing
-- anyone suspects when this table-privilege check (evaluated before RLS)
-- is the actual blocker.
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;

-- Cover any future table this project's migrations add, so this class of
-- bug can't resurface the next time a table is created as `postgres`.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select on tables to anon;
