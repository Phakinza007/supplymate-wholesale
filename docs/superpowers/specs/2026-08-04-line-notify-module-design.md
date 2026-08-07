# Phase 2 — LINE Notify Module: Design

## Context

Fourth and final Phase 2 optional module (Reviews, Variants, and Promotions are all done and
merged). Architecturally different from all three prior modules: it has **zero frontend code** —
it's a server-side integration notifying the store owner via LINE when order-relevant events
happen, not a customer/admin-facing UI feature.

## Research findings (established before designing, not assumed)

- **LINE Notify does not exist anymore.** LINE Corp terminated the service on March 31, 2025
  ([LINE Developers end-of-life notices](https://developers.line.biz/en/news/tags/end-of-life/1/),
  [LINE Notify's own closing announcement](https://notify-bot.line.me/closing-announce)). Any
  design built against the old LINE Notify API would ship broken. The recommended replacement is
  the **Messaging API**'s push endpoint: `POST https://api.line.me/v2/bot/message/push`, header
  `Authorization: Bearer <channel access token>`, body `{"to": "<userId>", "messages": [{"type":
  "text", "text": "..."}]}` ([LINE Developers — Sending
  messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)). This requires a
  LINE Official Account, a Channel Access Token, and the store owner's own LINE User ID as the push
  target — not a broadcast, so customers who happen to follow the OA never see these messages.
- **`pg_net` + Supabase Vault is Supabase's own documented pattern** for calling an external HTTP
  API from a Postgres trigger while keeping the API key encrypted at rest and out of application
  code/logs entirely ([Supabase Vault
  docs](https://supabase.com/docs/guides/database/vault)). This keeps the module inside this
  project's established all-migrations architecture — nothing so far has needed an Edge Function,
  and this doesn't either.
- **Neither extension is enabled yet.** `supabase/migrations/20250101000000_extensions_and_helpers.sql`
  currently only enables `pg_trgm`.

## The flag-gating wrinkle (resolved, not hidden)

`branding.config.ts`'s `lineNotify: true` (this module's default, unlike Reviews/Variants/
Promotions which all default `false` — LINE is the dominant messaging platform for Thai
businesses, so this boilerplate ships it enabled) **cannot gate a Postgres trigger** — there is no
frontend code to wrap in `<Feature flag="lineNotify">`, since this module has no UI at all.

The triggers are **always installed** by the migration. **Vault secret presence is the real
toggle**: `send_line_notification()` checks for both `line_channel_access_token` and
`line_admin_user_id` in Vault before attempting anything; if either is missing, it no-ops silently
(no error, no partial send). This mirrors an existing precedent already in this codebase:
`stockAutomation: true` is also a default-`true` backend-only flag with zero current consumer
(`create_order()`'s own comment says "stock-automation module hooks in here" — a forward
declaration, not a wired mechanism). LINE Notify follows the same shape: the flag documents intent
("this boilerplate ships LINE notifications active by default"), and the *actual* activation is the
store owner configuring their Vault secret during bootstrap — matching your choice to configure via
SQL/Vault rather than a new admin settings UI.

## Decisions

- **Two trigger events**, per your choice:
  - New order placed (`AFTER INSERT ON orders`) — fires exactly once per order, since `orders` has
    no insert path outside `create_order()`.
  - Payment slip uploaded (`AFTER UPDATE ON orders WHEN old.payment_slip_path IS NULL AND
    new.payment_slip_path IS NOT NULL`) — naturally re-fires after a reject→re-upload cycle, since
    `rejectSlip` (Step 7) nulls `payment_slip_path` before the customer's next upload sets it again.
  - Explicitly **not** wired to admin-driven status changes (verified/shipped/done/cancelled) —
    the admin already knows since they made those transitions themselves; only inbound,
    customer-driven events need pushing to the owner's phone.
- **A shared `send_line_notification(p_message text)` helper**, called by both trigger functions,
  doing: Vault lookup (no-op if either secret is missing) → `net.http_post` to the Messaging API
  push endpoint. `pg_net` is asynchronous (queues the request, a background worker sends it), so
  this never blocks the transaction it's called from.
- **The entire notification path is wrapped in an exception handler that swallows any failure**
  (missing Vault secrets, a malformed `pg_net` call, anything) — a notification glitch must never
  roll back or block `create_order()`, the project's most safety-critical RPC, especially given
  what's already riding on that function after the Variants and Promotions modules' own final-review
  fixes. This is a hard requirement, not a nice-to-have.
- **Bootstrap, not a UI**: CLAUDE.md gets a new documented step (matching the existing "promote the
  first admin by hand via SQL" bootstrap) — after creating the LINE Official Account and Channel
  Access Token, the store owner (or the person setting up their clone) runs `select
  vault.create_secret('<token>', 'line_channel_access_token')` and `select
  vault.create_secret('<user_id>', 'line_admin_user_id')` once. No admin settings page.
- **Message content stays simple** — order number, customer name, and total for a new order;
  order number for a slip upload — no deep link into `/admin/orders/:id`, since there's no existing
  "public app base URL" config anywhere in this project and adding one is out of scope for a
  notification feature.

## Testing

No real network calls in CI/local test runs, and no real LINE credentials needed. Verification (a
one-time implementer check, and — since this module produces no frontend behavior an E2E spec could
click through — a SQL-level test instead of a Playwright one) confirms the trigger correctly
**queues** a `pg_net` request with the right method/URL/payload shape after a test order is created
with dummy Vault secrets in place, inspectable via `pg_net`'s own request-tracking tables (exact
table/column names to be confirmed by reading the installed extension's schema during
implementation, not guessed here) — without needing the request to actually reach LINE's real
servers or succeed. Also verifies the exception-swallowing behavior: an order is created
successfully even when Vault secrets are entirely absent (the default state for anyone who hasn't
run the bootstrap step), confirming `create_order()` is never put at risk by this module.

## Out of scope

- An admin settings UI for configuring LINE credentials.
- Deep links from the LINE message back into the admin order detail page.
- Notifications for admin-driven status transitions (verified/shipped/done/cancelled).
- Rich message types (LINE Flex Messages, buttons, images) — plain text only.
- Delivery retry/backoff beyond whatever `pg_net`'s own worker does by default.
- Any other LINE integration surface (LIFF, rich menus, webhook-based two-way messaging).
