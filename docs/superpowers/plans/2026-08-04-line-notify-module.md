# LINE Notify Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the store owner via LINE when a new order is placed or a customer uploads a
payment slip — the fourth and final Phase 2 optional module, and architecturally different from
the first three: it has zero frontend code.

**Architecture:** Two Postgres extensions (`pg_net` for async outbound HTTP, `supabase_vault` for
encrypted credential storage), a shared `send_line_notification()` helper that reads the store
owner's LINE credentials from Vault and posts to the LINE Messaging API's push endpoint, and two
triggers on `orders` (new order, slip uploaded) that call it. Every failure mode is swallowed
inside the helper — a notification glitch must never block `create_order()` or
`attach_payment_slip()`, the project's two checkout-critical RPCs.

**Tech Stack:** Supabase (Postgres/`pg_net`/`supabase_vault`), LINE Messaging API.

## Global Constraints

- **LINE Notify (the old service) does not exist anymore.** LINE Corp shut it down on 2025-03-31
  ([LINE Developers end-of-life
  notices](https://developers.line.biz/en/news/tags/end-of-life/1/); [LINE Notify's own closing
  announcement](https://notify-bot.line.me/closing-announce)). This module targets the **Messaging
  API**'s push endpoint instead: `POST https://api.line.me/v2/bot/message/push`, header
  `Authorization: Bearer <channel access token>`, body `{"to": "<userId>", "messages": [{"type":
  "text", "text": "..."}]}` ([LINE Developers — Sending
  messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)).
- **`pg_net` + Vault, no Edge Function** — Supabase's own documented pattern for calling an
  external API from a trigger while keeping the API key encrypted at rest and never exposed to
  application code or logs ([Supabase Vault
  docs](https://supabase.com/docs/guides/database/vault)). Nothing in this project has needed an
  Edge Function so far and this module doesn't either.
- **`net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int)
  returns bigint`** is `pg_net`'s async POST call — it queues the request and returns immediately
  (a background worker sends it); use named parameters (`url := ..., headers := ..., body := ...`)
  for clarity, matching this project's SQL style elsewhere.
- **`vault.create_secret(new_secret text, new_name text, new_description text default null)
  returns uuid`** stores a secret; `select decrypted_secret from vault.decrypted_secrets where name
  = '...'` reads it back decrypted. Never expose `vault.decrypted_secrets` directly to any
  role/policy — the only access path is through `send_line_notification()`'s own `security
  definer` context, matching Vault's documented best practice.
- **Neither extension's local-stack availability has been confirmed yet** — Task 1's first real
  step is checking, not assuming. `pg_trgm` is the only extension currently enabled
  (`supabase/migrations/20250101000000_extensions_and_helpers.sql`). If `create extension if not
  exists pg_net with schema extensions;` / `create extension if not exists supabase_vault;` fail
  because the local CLI's Postgres image doesn't bundle them, that's a real blocker to escalate,
  not something to route around silently.
- **The `send_line_notification()` helper and both trigger functions are trigger-support-only,
  never directly RPC-callable** — matching the exact established convention from
  `supabase/migrations/20250101000700_advisor_fixes.sql` ("these functions exist only to be fired
  as triggers -- trigger firing does not require an EXECUTE grant, so revoke direct-RPC
  callability"). `revoke execute on function ... from public, anon, authenticated;` on all three,
  with **no** `grant ... to authenticated` line for any of them (unlike every RPC this project has
  added so far, which all end with a grant — these three are the exception, and that's correct).
- **Every failure inside `send_line_notification()` is swallowed** (`exception when others then
  raise warning ...; end;`) — missing Vault secrets, a malformed `pg_net` call, anything. This
  function is called from triggers fired inside `create_order()` and `attach_payment_slip()`, both
  `security definer` and both load-bearing for checkout after the Variants and Promotions modules'
  own final-review fixes tightened their correctness. A LINE notification must never be able to
  roll back an order or a slip attachment.
- **The slip-upload trigger uses a `CREATE TRIGGER ... WHEN (...)` clause**, not an `if` check
  inside the function body — `when (old.payment_slip_path is null and new.payment_slip_path is not
  null)` means Postgres skips invoking the trigger function entirely on unrelated `orders` updates,
  which is both more efficient and clearer than a body-level early return.
- **The `lineNotify` flag in `branding.config.ts` (already `true` by default, unlike Reviews/
  Variants/Promotions) cannot gate this module the way `<Feature>` gates the other three** — there
  is no frontend code to wrap, since this module has zero UI. The migration always installs the
  triggers; **Vault secret presence is the actual on/off switch** (missing either secret →
  `send_line_notification()` silently no-ops). This mirrors the existing `stockAutomation: true`
  flag, which already has zero current consumer in this codebase (`create_order()`'s own comment:
  "stock-automation module hooks in here" — a forward declaration, not a wired mechanism). Task 3
  documents this explicitly in CLAUDE.md rather than leaving it implicit.
- **No new migration to `database.types.ts` regeneration is needed** — this module adds no new
  table and no new columns to `orders`; only extensions, functions, and triggers. Skip the
  regeneration step other modules' plans included.
- **No Playwright E2E spec** — there is no frontend behavior to click through. Verification
  (Task 3) is a live, documented SQL/curl procedure instead, matching how every prior module's Task
  1 already verified its RPCs directly against the local stack before any UI existed to exercise
  them.

---

### Task 1: Extensions + shared `send_line_notification()` helper

**Files:**
- Create: `supabase/migrations/20250101001200_line_notify.sql`

**Interfaces:**
- Produces (consumed by Task 2): `public.send_line_notification(p_message text) returns void` —
  silently no-ops if either Vault secret is missing; never raises (all failures caught and logged
  via `raise warning`, never propagated to the caller).

- [ ] **Step 1: Confirm both extensions are actually available on the local stack**

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select name, default_version, installed_version from pg_available_extensions where name in ('pg_net', 'supabase_vault');"
```

Expected: two rows, both with a non-null `default_version`. If either row is missing entirely
(the extension isn't bundled in this Postgres image at all), stop and report this as a blocker —
do not attempt to work around it with a different mechanism without checking with the project
maintainer first, since it changes this module's whole architecture.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20250101001200_line_notify.sql`:

```sql
-- LINE Notify replacement: LINE Corp shut down the LINE Notify service on
-- 2025-03-31 (https://notify-bot.line.me/closing-announce). This module
-- uses the Messaging API's push endpoint instead
-- (https://developers.line.biz/en/docs/messaging-api/sending-messages/).
--
-- pg_net + Vault is Supabase's own documented pattern for calling an
-- external API from a trigger while keeping the API key encrypted at rest
-- (https://supabase.com/docs/guides/database/vault) -- this keeps the
-- module inside this project's all-migrations architecture, no Edge
-- Function needed.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- The store owner configures these once -- see CLAUDE.md's bootstrap step
-- (create a LINE Official Account + Channel Access Token, then):
--   select vault.create_secret('<channel access token>', 'line_channel_access_token');
--   select vault.create_secret('<the owner''s own LINE user id>', 'line_admin_user_id');
-- Neither secret exists by default -- this function silently no-ops until
-- both are configured, which is the actual on/off switch for this module.
-- branding.config.ts's lineNotify flag has no frontend code to gate, since
-- this module has no UI at all -- see CLAUDE.md's "LINE Notify" section.
create or replace function public.send_line_notification(p_message text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_token   text;
  v_user_id text;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'line_channel_access_token';
  select decrypted_secret into v_user_id
    from vault.decrypted_secrets where name = 'line_admin_user_id';

  if v_token is null or v_user_id is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.line.me/v2/bot/message/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object(
      'to', v_user_id,
      'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_message))
    )
  );
exception
  when others then
    -- A LINE notification failure must never block or roll back whatever
    -- called this function (create_order()/attach_payment_slip(), both
    -- checkout-critical). Swallow everything; log a warning, nothing more.
    raise warning 'send_line_notification failed: %', sqlerrm;
end;
$$;

revoke execute on function public.send_line_notification(text) from public, anon, authenticated;
```

- [ ] **Step 3: Apply and verify the helper no-ops with no secrets configured**

```bash
supabase db reset
```

Expected: `Applying migration 20250101001200_line_notify.sql...` with no error.

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select extname from pg_extension where extname in ('pg_net', 'supabase_vault');"
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select public.send_line_notification('test message with no secrets configured');"
```

Expected: the first query returns 2 rows. The second returns with no error (a plain `void`
result, no exception) — confirming the "no secrets configured" path returns cleanly rather than
raising, since at this point in the plan no secret has been created yet.

- [ ] **Step 4: Verify the helper actually sends when secrets ARE configured**

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select vault.create_secret('test-fake-token', 'line_channel_access_token');"
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select vault.create_secret('Utest1234567890', 'line_admin_user_id');"
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select public.send_line_notification('test message with fake secrets');"
```

Expected: no error (the fake token will fail authentication against LINE's real API, but that
failure happens asynchronously inside `pg_net`'s worker, not synchronously in this call — the
`send_line_notification()` call itself must still return cleanly). Then confirm a request was
actually queued:

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select id, url, headers, created from net.http_request_queue order by created desc limit 1;"
```

If that table is already empty (the worker may have already processed and moved the row), check
the response table instead:

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select id, status_code, content, error_msg, created from net._http_response order by created desc limit 1;"
```

Expected: a row referencing `https://api.line.me/v2/bot/message/push`, and — since the token is
fake — either a non-2xx `status_code` from LINE's real API or a `timed_out`/`error_msg` if the
sandbox has no outbound internet access. Either outcome is fine for this step; the point is
confirming the request was correctly *attempted* with the right URL/headers, not that it
succeeded. Clean up the test secrets afterward so they don't leak into later tasks' verification:

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "delete from vault.secrets where name in ('line_channel_access_token', 'line_admin_user_id');"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20250101001200_line_notify.sql
git commit -m "feat(line-notify): add pg_net/vault extensions and send_line_notification helper"
```

---

### Task 2: Order-event triggers

**Files:**
- Create: `supabase/migrations/20250101001300_line_notify_triggers.sql`

**Interfaces:**
- Consumes: Task 1's `public.send_line_notification(p_message text)`.
- Produces: triggers `trg_orders_notify_line_new_order` (`AFTER INSERT ON orders`) and
  `trg_orders_notify_line_slip_uploaded` (`AFTER UPDATE ON orders WHEN (old.payment_slip_path is
  null and new.payment_slip_path is not null)`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20250101001300_line_notify_triggers.sql`:

```sql
create or replace function public.notify_line_new_order()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.send_line_notification(
    format('New order #%s from %s — ฿%s', new.order_number, new.customer_name, new.total)
  );
  return new;
end;
$$;

create trigger trg_orders_notify_line_new_order
  after insert on public.orders
  for each row execute function public.notify_line_new_order();

create or replace function public.notify_line_slip_uploaded()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.send_line_notification(
    format('Payment slip uploaded for order #%s — please verify', new.order_number)
  );
  return new;
end;
$$;

create trigger trg_orders_notify_line_slip_uploaded
  after update on public.orders
  for each row
  when (old.payment_slip_path is null and new.payment_slip_path is not null)
  execute function public.notify_line_slip_uploaded();

revoke execute on function public.notify_line_new_order() from public, anon, authenticated;
revoke execute on function public.notify_line_slip_uploaded() from public, anon, authenticated;
```

- [ ] **Step 2: Apply and verify both triggers fire correctly through the real checkout flow**

```bash
supabase db reset
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select vault.create_secret('test-fake-token', 'line_channel_access_token');"
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select vault.create_secret('Utest1234567890', 'line_admin_user_id');"
```

Using the seeded `customer@example.com`/`password123` account (get an access token the same way
prior modules' Task 1 verification steps did — see any earlier task report for the exact curl
invocation, or `e2e/helpers/auth.ts` for the equivalent Playwright-side flow), call the real
`create_order` RPC for a legitimate cart, then check for a queued/sent request referencing the new
order's number in its body:

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select id, url, body::text, created from net.http_request_queue order by created desc limit 1;"
# or, if already processed:
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select id, status_code, content, created from net._http_response order by created desc limit 1;"
```

Then call `attach_payment_slip` for that same order (a real storage upload isn't required for this
verification — confirm via reading `attach_payment_slip()`'s own validation whether a real
uploaded object is required before the RPC succeeds, and if so, actually upload a small test file
to the `payment-slips` bucket first, following the exact path convention
`{user_id}/{order_id}/...` documented in CLAUDE.md's Supabase section), then re-check
`net.http_request_queue`/`net._http_response` for a second new request.

Finally, remove the test secrets and confirm order creation still succeeds cleanly with **no**
notification attempted:

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "delete from vault.secrets where name in ('line_channel_access_token', 'line_admin_user_id');"
```

Place one more test order via `create_order` — expected: succeeds normally (same response shape as
always), and no new row appears in `net.http_request_queue`/`net._http_response` for it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20250101001300_line_notify_triggers.sql
git commit -m "feat(line-notify): add new-order and slip-uploaded triggers"
```

---

### Task 3: Verification, CLAUDE.md documentation, final regression

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1-2's helper and triggers — no new code produced by this task, only
  documentation and a final regression pass.

- [ ] **Step 1: Confirm `create_order()`/`attach_payment_slip()` are genuinely unaffected by a
  broken notification path**

With no Vault secrets configured (the default state), and separately with deliberately malformed
secrets in place (e.g. `select vault.create_secret('', 'line_channel_access_token');` — an empty
token, which will cause `net.http_post`'s eventual response to be a clean auth failure rather than
a crash, but confirm the *synchronous* `send_line_notification()` call still can't raise), place a
full golden-path order through `create_order()` and `attach_payment_slip()` and confirm both
succeed with normal responses in every configuration. This is the safety property Global
Constraints calls non-negotiable — confirm it holds, don't just trust the migration's `exception
when others` clause to be correctly written.

- [ ] **Step 2: Add a "LINE Notify" section to CLAUDE.md**

Add a new section (place it after the existing "Promotions" documentation this project's Phase 2
modules have been accumulating — check CLAUDE.md's current structure and place it consistently
with how Reviews/Variants/Promotions sections are ordered relative to the original spec sections)
covering:
- The Messaging API replaces the deprecated LINE Notify service — link the two source URLs from
  this plan's Global Constraints.
- The bootstrap step: after creating a LINE Official Account + Channel Access Token, run
  `select vault.create_secret('<token>', 'line_channel_access_token');` and `select
  vault.create_secret('<the owner's LINE user id>', 'line_admin_user_id');` once — matching the
  existing "promote the first admin by hand" bootstrap step's documented style and prominence.
- The two trigger events (new order, slip uploaded) and that admin-driven status transitions are
  deliberately NOT wired (the admin already knows, since they made those changes themselves).
- The flag-gating wrinkle: `lineNotify`'s default-`true` in `branding.config.ts` documents intent
  but has no frontend code to gate (this module has zero UI) — Vault secret presence is the actual
  on/off switch, mirroring `stockAutomation`'s existing same-shaped precedent.
- The non-negotiable safety property: every failure inside `send_line_notification()` is
  swallowed, so a broken/missing LINE configuration can never block checkout.

- [ ] **Step 3: Final regression check**

```bash
npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

Expected: all pass, identical results to before this module's work started — this module touches
zero frontend files, so this is confirming that fact held, not exercising any new behavior. The
existing suite (golden-path + security passing, reviews/variants/promotions specs skipped under
their own default-off flags) should be completely unaffected.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(line-notify): document bootstrap step and flag-gating architecture"
```
