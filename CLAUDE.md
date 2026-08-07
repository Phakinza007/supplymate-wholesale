# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 1 build in progress. Step 0 (scaffold), Step 1 (Supabase schema), Step 2 (auth + profile +
address book), Step 3 (product catalog), Step 4 (cart + checkout + payment slip upload),
Step 5 (order history), Step 6 (admin product/category CRUD), Step 7 (admin order management), and
Step 8 (E2E tests) are done.

## Admin

- `<AdminRoute />` (built in Step 2, first used here) gates every route under `/admin`, as a
  **sibling** of the `<ProtectedRoute />` group in `src/App.tsx`, not nested inside it — `AdminRoute`
  already redirects unauthenticated visitors to `/login` and non-admins to `/` on its own.
  `AdminLayout` (`src/core/admin/AdminLayout.tsx`) renders the nav + `<Outlet />` for `/admin/products`
  and `/admin/categories`.
- Admin queries (`useAdminProducts`, `useAdminCategories`, `useAdminOrders`, `useAdminOrder`)
  intentionally select **all** rows, active/inactive or any owner — that's correct and doesn't need
  an `is_active`/`user_id` filter, because the admin RLS read policies already return everything to
  `is_admin()` callers and this is the admin's own view. **Do not copy this pattern onto a query
  meant to be "my own rows only"** — see the `useOrders()` note in the Order history section below;
  an unfiltered query there once leaked every customer's orders to the admin account. The admin
  queries in `src/core/admin/` are correct specifically because "show everything to admins" is the
  actual intent here, not an oversight.
- Products and categories are **deactivated (`is_active = false`), never deleted**, from the admin
  UI — no delete button exists anywhere in `src/core/admin/`. Hard delete stays possible outside the
  app (SQL/dashboard) as the safety net, not the happy path.
- The list-or-form single-page pattern (`editing: T | 'new' | null` local state, no separate
  create/edit routes) is now used by `AddressBookPage` (Step 2), `AdminCategoryListPage`, and
  `AdminProductListPage` — follow this convention for the next resource that needs simple CRUD
  rather than introducing route-per-form.
- **`sku` must default to `null`, never `''`.** `products.sku` is `unique`, and Postgres allows many
  `NULL`s but only one empty string — a blank-SKU form defaulting to `''` breaks on the second
  product and silently rewrites existing `null` SKUs to `''` on every edit. `AdminProductForm`
  handles this correctly now (`initial?.sku ?? null`); replicate this exact pattern for any other
  nullable-but-unique text field a future form adds.
- Product images live in the public `product-images` bucket at `{product_id}/{uuid}.ext` — no
  ownership-path convention needed (unlike `payment-slips`), since the bucket's write policies gate
  on `is_admin()`, not path matching. Deleting an image removes the `product_images` row **before**
  the storage object, so a mid-failure leaves an orphaned (harmless, cleanable-by-prefix) file rather
  than a database row pointing at a missing file.
- `getErrorMessage()` (`src/lib/getErrorMessage.ts`) is now the one shared helper for Supabase
  RPC/PostgREST's plain-object error shape — every mutation-error render in `src/core/checkout/`,
  `src/core/orders/`, `src/core/profile/`, and `src/core/admin/` uses it. Use it for any new mutation
  error, don't reintroduce a local `instanceof Error` check.
- Every list page that queries Supabase must handle `isError`, not just `isLoading` — a failed query
  with only an `isLoading` check renders as an empty list, indistinguishable from "no rows yet," and
  an admin acting on that can duplicate data that failed to load. `OrderListPage`/`AddressBookPage`/
  the admin list pages all follow this; copy the pattern (`<p className="p-8 text-destructive">Failed
  to load X.</p>` after the loading check) for any new list page, including Step 7's admin order
  list.

## Admin order management

- `/admin/orders` (`AdminOrderListPage`) and `/admin/orders/:orderId` (`AdminOrderDetailPage`) are
  genuinely separate from the customer-facing `/orders` pages — not a shared component with admin
  branching. `AdminOrderDetailPage` shows customer identity, the full shipping address, and
  status-transition controls the customer page must never expose.
- Status changes are **direct `supabase.from('orders').update({status: ...})` calls, not an RPC** —
  unlike checkout (`create_order`/`attach_payment_slip`, both `SECURITY DEFINER` RPCs, because
  customers have no INSERT/UPDATE policy on `orders` at all). Admins genuinely hold an `orders:
  admin updates` RLS policy, and the Step 1 trigger `enforce_order_status_transition` validates
  every transition and derives `verified_at`/`verified_by`/`shipped_at`/`completed_at`/
  `cancelled_at` itself — the client only ever sends the target `status` (plus `tracking_number`/
  `shipping_carrier` on ship, `cancel_reason` on cancel). `enforce_order_immutability` still blocks
  a direct admin update from rewriting money or the address snapshot, so this is safe.
  `useAdminOrderMutations.ts`'s five actions (`verifyPayment`, `rejectSlip`, `shipOrder`,
  `completeOrder`, `cancelOrder`) mirror the trigger's matrix in the UI only to grey out invalid
  actions — the DB trigger remains the real gate if the UI and trigger ever drift.
- **`rejectSlip` nulls `payment_slip_path` and `payment_slip_uploaded_at`** in the same update as
  the `status: 'pending'` change — required so the customer-facing upload form reappears (see the
  Cart/checkout section above).
- Payment slips are viewed via a 60-second signed URL (`supabase.storage.from('payment-slips')
  .createSignedUrl(path, 60)`), rendered as a plain link (`target="_blank"`), never an `<img>` —
  the bucket accepts PDFs too, which an inline `<img src>` breaks silently for. The query refreshes
  itself (`refetchInterval: 45_000`) so a URL doesn't go stale while the admin is still reading the
  order before clicking it, and its `isError` state is handled distinctly from "no slip uploaded" —
  conflating the two would let a transient fetch failure look identical to a customer never having
  paid, which is exactly the wrong failure mode for a button that can reject/cancel an order.
- **Known gap, not yet built:** the customer never sees *why* a slip was rejected or that a
  cancellation happened for a stated reason — `cancel_reason` and a rejection note both exist
  server-side (`order_status_history.note` is RLS-readable by the order's owner) but nothing writes
  or displays them on the customer-facing `OrderDetailPage`. Same for `tracking_number`/
  `shipping_carrier`, collected by the admin but currently invisible to the customer. Worth a
  follow-up plan rather than assuming it's covered.

## Cart, checkout, payment slip

- Cart is client-only: a Zustand store (`src/core/cart/cartStore.ts`) persisted to `localStorage`
  under the key `ecom-cart`. There is no `carts` table and no server round-trip until checkout —
  `create_order()` re-prices everything server-side, so a stale or hand-edited cart can only
  produce an "unavailable" error, never a mispriced order. Every cart line always has
  `variantId: null` (no variant picker exists yet — Phase 2).
- Checkout calls `supabase.rpc('create_order', {...})`, mapping cart lines to
  `{product_id, variant_id, quantity}`. Its `Returns` type is a single `orders` row object, not an
  array — never index into it with `data[0]`.
- Every route lives inside `<SiteLayout>` (`src/components/SiteLayout.tsx`), which renders
  `<SiteHeader>` once above an `<Outlet />`. The header's cart badge reads `useCartTotalItems()` —
  any new cart-mutating code must go through `useCartStore`, not a parallel state path, or the
  badge will desync.
- Payment slip upload is two calls, in order: `supabase.storage.from('payment-slips').upload(path, file)`
  where `path` is `${user.id}/${order.id}/${unique-suffix}.{ext}` (the caller's own id must be the
  first segment — storage RLS and `attach_payment_slip()` both reject anything else), then
  `supabase.rpc('attach_payment_slip', {p_order_id, p_path})`. This only succeeds while
  `orders.status = 'pending'` — the UI must hide the upload form once status moves on, or once a
  slip already exists.
- Supabase RPC/PostgREST errors are **plain objects, not `Error` instances** — a bare
  `error instanceof Error` check silently swallows every real server message (e.g. "one or more
  items are unavailable"). Always go through a `getErrorMessage(error, fallback)` helper that also
  checks for a `message` property on plain objects (see `CheckoutPage.tsx`/`OrderDetailPage.tsx`
  for the pattern; now duplicated across `core/checkout/` and `core/orders/` — a shared
  `src/lib/getErrorMessage.ts` is warranted once a fourth or fifth call site shows up) — this same
  latent bug still exists in `src/core/profile/AddressBookPage.tsx` and `ProfilePage.tsx` from
  Step 2 and is worth fixing next time those files are touched.
- Cart line prices are cached at add-to-cart time for display only; the order actually created can
  differ if a price changed before checkout (the RPC always wins). There's currently no
  "price changed" notice on checkout — acceptable for Phase 1, worth revisiting if it comes up.
- A rejected payment slip (`verified -> pending` bounce, via the admin's "Reject slip" action in
  `useAdminOrderMutations.ts`) nulls both `payment_slip_path` and `payment_slip_uploaded_at`, so
  `OrderDetailPage`'s existing `!payment_slip_path` gate naturally re-shows the upload form — no
  special-casing needed on the customer side. The customer currently sees no explanation of *why*
  a new upload is being requested (no rejection reason surfaces anywhere on their page) — a known,
  deferred gap; see the Admin order management section below.

## Order history

- `src/core/orders/OrderDetailPage.tsx` (route `/orders/:orderId`) is shared between two entry
  points: checkout's post-order redirect (`CheckoutPage.tsx`) and the order list
  (`OrderListPage.tsx`, route `/orders`). It has no special-casing for either path — same component,
  same query, same three-way pending/slip-uploaded/not-pending status UI regardless of how the user
  arrived. Don't reintroduce "just placed this order" logic here; if that affordance is wanted back,
  pass it via `navigate(..., { state: {...} })` rather than branching the component's own state.
- **`orders`' RLS grants admins full read access via a `using` clause that ORs `user_id = auth.uid()`
  with `is_admin()`** — every query against `orders` (or any table with the same admin-bypass shape)
  needs an explicit `.eq('user_id', ...)` filter if it's meant to show only the caller's own rows;
  RLS alone will happily return everything to an admin account, which — per this project's own
  bootstrap step — is the store owner's own login. `useOrders()` and `OrderDetailPage.tsx` both do
  this correctly; copy that pattern for any new customer-facing query, don't assume RLS is doing
  more scoping than it actually is.
- `OrderDetailPage` (customer-facing) and `AdminOrderDetailPage` (`src/core/admin/`, Step 7) are
  deliberately two separate components, not one with an `isAdmin` branch — see the Admin order
  management section below for why, and for what data each one currently shows.
- User-scoped TanStack Query keys everywhere (`['profile', user?.id]`, `['addresses', user?.id]`,
  `['orders', user?.id]`, `['order', user?.id, orderId]`) — and `AuthProvider`'s `signOut` calls
  `queryClient.clear()`, so a shared browser never serves a previous user's cached query data after
  sign-out. Keep new user-data queries consistent with this: scope the key, don't rely on the
  component unmounting to "clear" stale data for you.

## Catalog

- `/shop` (`src/core/catalog/ProductListPage.tsx`) and `/products/:slug`
  (`src/core/catalog/ProductDetailPage.tsx`) are public routes — outside `<ProtectedRoute />`.
- Category/search/page filter state lives in URL search params (`useSearchParams`), not local-only
  React state, so filtered views are shareable and back-button-safe.
- `useProducts()` takes an `enabled` option — always gate it when a category slug is present in the
  URL but `useCategories()` hasn't resolved yet, otherwise the query briefly runs unfiltered against
  the full catalog before re-filtering.
- Money always renders via `formatPrice()` (`src/lib/formatPrice.ts`), never a raw
  `Number(price).toLocaleString()` — the schema's `numeric(12,2)` columns return as JS numbers that
  drop trailing zeros (`249.50` → `"249.5"`) without explicit `minimumFractionDigits`. The currency
  symbol comes from `brandConfig.currencySymbol`, not a hardcoded `฿`.
- `resolveImageUrl()` (`src/lib/resolveImageUrl.ts`) is the only place that should ever read
  `product_images.storage_path` / `categories.image_path` — it passes through absolute `http(s)://`
  URLs (used by seed/demo rows) and resolves anything else via
  `supabase.storage.from('product-images').getPublicUrl()`. New code should call this helper, not
  re-implement the http(s) check.
- A Supabase query expecting exactly one row (e.g. product-by-slug) should use `.maybeSingle()` with
  `retry: false`, not `.single()` — `.single()` throws on zero rows, and TanStack Query's default
  3-retry backoff turns a "not found" into a multi-second hang before the UI catches up.

## Auth

- `AuthProvider` (`src/core/auth/AuthProvider.tsx`) owns the Supabase session; `useAuth()` reads
  `{session, user, loading, signOut}`, `useProfile()` fetches the current user's `profiles` row via
  TanStack Query (key `['profile', user?.id]`).
- `<ProtectedRoute />` / `<AdminRoute />` gate routes on `useAuth()`/`useProfile()` and render a
  loading indicator (not a blank screen) while auth state resolves.
- Signup must branch on Supabase's `signUp()` response shape, not just its `error` field: an
  already-registered email returns `error: null` with a fake user (`identities: []`); a pending
  email confirmation returns `error: null` with `session: null`. See
  `src/core/auth/SignupPage.tsx` for the three-way branch and its "check your email" panel.
- Address book relies entirely on the DB for the "one default address per user" rule (a trigger +
  partial unique index from Step 1) — client code only ever sets `is_default: true` on the row
  being saved and never touches sibling rows.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run typecheck` — typecheck only
- `npm run lint` — oxlint + `scripts/check-core-boundary.mjs` (fails if `src/core` imports from
  `src/modules/optional`)
- `npm run preview` — preview the production build
- `npm run test:e2e` — run the Playwright E2E suite (see Testing below)

## Testing

- `npm run test:e2e` runs the Playwright suite in `e2e/` (`golden-path.spec.ts` +
  `security.spec.ts`), single worker, against a **local Supabase stack only** — never point it at a
  hosted project. Its `pretest:e2e` hook runs `supabase start`, writes `.env.e2e.local`
  (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, read by both the Vite dev server started under
  `--mode e2e` and, via `dotenv.config()` in `playwright.config.ts`, the Node test process itself —
  e.g. for the direct `@supabase/supabase-js` cross-user check in `security.spec.ts`), then
  `supabase db reset --yes` for a clean DB every run. Requires the Supabase CLI and Docker; the
  first run can take a minute or two.
- Two seeded accounts exist for tests/manual use after `supabase db reset`, both password
  `password123`: `admin@example.com` (role `admin`, used by the golden-path spec to fulfil an
  order from `/admin/orders`) and `customer@example.com` (a plain customer, seeded for convenience
  but not currently exercised by name in any spec — the specs create their own throwaway accounts
  via `uniqueEmail()`/`signUp()` instead, so runs don't collide on shared state).
- `e2e/security.spec.ts` covers the two access-control checks the golden path doesn't: a non-admin
  hitting `/admin` gets redirected to `/`, and Customer B cannot read Customer A's payment slip
  (checked at the API layer via a signed-URL request with Customer B's own session, since the UI
  never exposes another user's slip path to attempt this through).
- `e2e/**` is intentionally outside `tsconfig.app.json`'s `include`, so it doesn't affect
  `npm run typecheck`/`npm run build`.

## Supabase

- Migrations live in `supabase/migrations/*.sql`, applied in filename order. Each file owns one
  table's full story: DDL, RLS enable, policies, and triggers together — not split into a separate
  end-of-list RLS file — so a client editing this kit can see a table's entire security story in
  one place. Migration `20250101000800_public_table_grants.sql` grants baseline table privileges
  to `anon`/`authenticated`/`service_role` so RLS is the *only* remaining gate on any future public
  table — a new table that forgets `enable row level security` now fails **open** (silently leaks
  reads or allows writes) rather than failing closed with a 403, so don't skip that step on a new
  table just because the grants migration already ran.
- **Checkout is `supabase.rpc('create_order', {...})`, not `supabase.from('orders').insert(...)`.**
  There is no INSERT policy on `orders`/`order_items` by design — prices are re-read from
  `products`/`product_variants` server-side inside `create_order()`, so a tampered client cart
  cannot express a price. A direct insert returns 403; that's working as intended.
- Payment slip upload is two calls: upload to the private `payment-slips` bucket at
  `{user_id}/{order_id}/...`, then `supabase.rpc('attach_payment_slip', {...})` to link it to the
  order. `user_id` must be the first path segment — that's what makes the storage RLS ownership
  check a string compare instead of a join.
- Order status can only move forward through the DB trigger's transition matrix
  (`pending -> verified -> shipped -> done`, plus `cancelled` and the `verified -> pending`
  "slip rejected" bounce) — enforced in Postgres, not the app layer, since the browser talks to
  PostgREST directly with the user's own JWT.
- Admin check is `profiles.role = 'admin'` via the `public.is_admin()` `SECURITY DEFINER` helper.
  **New-client bootstrap step:** after creating the project and running migrations, promote the
  first admin by hand — `update public.profiles set role = 'admin' where email = '<client email>';`
  — there is no UI path to do this (by design, to block self-promotion).
- `supabase/seed.sql` is local-dev-only mock data (run via `supabase db reset`); never push it to a
  hosted project.

## Phase 2 modules

Reviews, Variants, Promotions, and LINE Notify have all shipped now — patterns established across
the first three (LINE Notify is architecturally different; see its own section below):

- **Wiring an optional module into a core file** is lazy-load + `<Feature flag="...">` +
  `<Suspense>`: `const X = lazy(() => import('@/modules/optional/x/X'))`, then
  `<Feature flag="x"><Suspense fallback={null}><X ... /></Suspense></Feature>` at the call site
  (see `CheckoutPage.tsx`'s `PromoCodeField` wiring). The one real gotcha, hit in all three
  modules: `scripts/check-core-boundary.mjs`'s forbidden-import check is text-based regex, so even
  `import type { X } from '@/modules/optional/...'` trips it — a type-only import still matches
  `from '@/modules/optional'`. The established fallback isn't fighting the linter; it's a small,
  local duplicate interface in the core file, narrowed to only the fields that file actually reads
  (see `CheckoutPage.tsx`'s local `AppliedPromo`, deliberately missing two fields the real
  `PromoCodeField.tsx` `AppliedPromo` has, since structural typing satisfies the narrower shape
  automatically).
- **Every optional module ships a permanent, flag-guarded E2E spec**, not a throwaway one — this
  was established after Reviews' first pass shipped a spec that was deleted after use, leaving zero
  regression coverage for that module. The convention since (Variants, Promotions): a real spec
  file under `e2e/` that opens with `test.skip(!brandConfig.features.x, '...')`, so it skips
  cleanly under this repo's committed default flags and activates automatically the moment a client
  flips the flag on. Keep new modules on this pattern rather than reverting to a scratch spec.
- **Two security lessons, learned once each in Variants and Promotions, apply to every future
  module:** (a) a client-facing validation check (Variants' UI-side stock check, Promotions'
  `validate_promo_code()`) is a UX convenience only — the actual mutating RPC (`create_order()`)
  must always re-verify the same condition itself, server-side, never trusting the earlier check's
  result. (b) any check-then-consume pattern against a shared, limited resource (Variants' stock,
  Promotions' `max_uses`/`uses_count`) must lock the row (`for update`) before checking, or two
  concurrent requests can both pass the check before either commits, over-selling the resource.
- **`supabase gen types typescript --local` gotcha, now recurring:** the installed Supabase CLI
  does not reliably emit the `__InternalSupabase: { PostgrestVersion: ... }` block (independent of
  `--schema public`), and its absence makes supabase-js silently fall back to PostgREST version
  `'12'` typing. This has silently regressed twice already (Reviews, then Promotions).
  `scripts/check-database-types.mjs` (wired into `npm run lint`) now catches a missing block
  automatically — but regenerating types still means re-checking the block is there before
  committing, the script just stops it from going unnoticed.

## LINE Notify

- The old **LINE Notify** service was shut down by LINE Corp on 2025-03-31 ([LINE Developers
  end-of-life notices](https://developers.line.biz/en/news/tags/end-of-life/1/); [LINE Notify's own
  closing announcement](https://notify-bot.line.me/closing-announce)) — this module targets the
  **Messaging API**'s push endpoint instead (`POST https://api.line.me/v2/bot/message/push`), via
  `send_line_notification()` in `supabase/migrations/20250101001200_line_notify.sql`.
- Architecturally different from Reviews/Variants/Promotions: **zero frontend code.** It's a
  server-side integration (two DB triggers + a `pg_net`/Vault helper) notifying the store owner via
  LINE when order-relevant events happen — nothing under `src/modules/optional/line-notify/` to
  wire in.
- **Bootstrap step, matching the existing "promote the first admin by hand" step's style and
  prominence:** after creating a LINE Official Account and a Channel Access Token, run once —
  `select vault.create_secret('<token>', 'line_channel_access_token');` and
  `select vault.create_secret('<the owner's LINE user id>', 'line_admin_user_id');` — there is no
  UI path for this either.
- **Two trigger events**, both in `supabase/migrations/20250101001300_line_notify_triggers.sql`:
  a new order (`trg_orders_notify_line_new_order`, `AFTER INSERT ON orders`) and a payment slip
  upload (`trg_orders_notify_line_slip_uploaded`, `AFTER UPDATE ... WHEN old.payment_slip_path IS
  NULL AND new.payment_slip_path IS NOT NULL` — this also re-fires naturally after a reject ->
  re-upload bounce, no special-casing needed). Admin-driven status transitions
  (verified/shipped/done/cancelled) are deliberately **not** wired — the admin already knows,
  since they made those changes themselves.
- **The flag-gating wrinkle:** `lineNotify: true` in `branding.config.ts` documents intent but has
  no frontend code to gate, since this module has no UI at all — there's nothing to wrap in
  `<Feature flag="lineNotify">`. Vault secret presence is the actual on/off switch:
  `send_line_notification()` no-ops silently if either `line_channel_access_token` or
  `line_admin_user_id` is missing from Vault. This mirrors `stockAutomation: true`'s existing
  same-shaped precedent — also a default-`true` backend-only flag with no wired frontend consumer.
- **Non-negotiable safety property:** every failure inside `send_line_notification()` — missing
  secrets, a malformed `pg_net` call, a LINE API error — is caught by its own `exception when
  others` handler (`raise warning`, nothing more), so a broken or unconfigured LINE integration can
  never block or roll back `create_order()`/`attach_payment_slip()`. Confirmed directly, not just
  trusted from the migration text: both RPCs succeed normally with no Vault secrets configured
  (the default state) and separately with a deliberately empty `line_channel_access_token` (which
  still reaches LINE's real API and gets a clean 401 back asynchronously, well after the RPC has
  already returned success).
- The two trigger functions (`notify_line_new_order`, `notify_line_slip_uploaded`) are **themselves
  `security definer`** too, matching `log_order_status_change()`'s established precedent
  (`supabase/migrations/20250101000700_advisor_fixes.sql`) for "AFTER trigger on `orders` that needs
  elevated access." This is required, not incidental: `send_line_notification()` has `execute`
  revoked from `public`/`anon`/`authenticated`, and triggers can fire under privilege contexts the
  module doesn't control — `service_role` bypasses RLS entirely and can `insert into orders`
  directly, and the existing `"orders: admin updates"` RLS policy genuinely permits an admin session
  to flip `payment_slip_path` from null to non-null via PostgREST. Without `security definer` on the
  trigger functions themselves, either path hits a permission-denied error calling
  `send_line_notification()` from *outside* its own `exception when others` handler, defeating this
  module's non-negotiable "never block the caller" property. Both functions pin
  `set search_path = public, pg_temp`, same as every other `security definer` function in this
  codebase.
- **Currency symbol note for clients with a different currency:** `notify_line_new_order()`'s
  message text intentionally has no currency symbol (SQL can't read `brandConfig.currencySymbol`) —
  a client cloning this kit should edit the `format(...)` call directly in
  `supabase/migrations/20250101001300_line_notify_triggers.sql` if they want one prefixed.
- **`line_admin_user_id` must be an individual LINE user ID, not a group/room ID** — the Messaging
  API's `to` field on the push endpoint accepts either, but pointing it at a LINE group or room
  would expose every customer's name and order total to everyone in that chat; this matters
  especially since `lineNotify` ships enabled by default and this kit targets Thai clients under
  PDPA.
- **`pg_net`'s `net` schema/tables are granted to `PUBLIC` by the extension itself**, and this
  project's migrations cannot revoke that (confirmed: attempting `revoke` on `net.*` fails with "no
  privileges could be revoked," since the `net` schema is owned by `supabase_admin`) — a future
  contributor must never add `net` to `supabase/config.toml`'s exposed `db.schemas`, and must never
  build a `security invoker` helper that touches it. The channel access token passes through
  `net.http_request_queue`/`net._http_response` in plaintext until the async worker drains it; that
  data stays private only because the `net` schema itself is never exposed via PostgREST.

## What this is

Commerce Starter Kit — a reusable e-commerce boilerplate that gets cloned per client. This is **not**
a multi-tenant SaaS product: each client is a separate repository clone paired with its own separate
Supabase project.

## Stack

React (Vite) + Tailwind + shadcn/ui | Supabase (Auth/Postgres/Storage) | Vercel | Zustand

## Core rules

- All branding (colors/logo/name) lives in `config/branding.config.ts` — never hardcode brand values
  elsewhere in the app.
- Optional modules live in `modules/optional/{name}/`, toggled via feature flags in
  `branding.config.ts`.
- Core code must never depend on optional modules — core must work correctly with every optional
  flag off.
- Schema should anticipate optional fields (e.g. variant columns) even when unused by the current
  client, so enabling an optional module later doesn't require a schema migration.

## Planned structure

```
src/
  config/branding.config.ts
  core/{auth,profile,catalog,cart,checkout,orders,admin}
  modules/optional/{reviews,qna,variants,analytics-dashboard,stock-automation,line-notify,pdf-documents,promotions}
  lib/supabase.ts
```

## Feature flag config shape

```ts
export const brandConfig = {
  storeName: "", logoUrl: "",
  colors: { primary: "#000", secondary: "#fff" },
  theme: "light",
  features: {
    reviews: false, qna: false, variants: false, analyticsDashboard: false,
    stockAutomation: true, lineNotify: true, pdfDocuments: false, promotions: false,
  },
};
```

## Core scope (Phase 1 — every project)

auth, profile, address book, product catalog (list+detail, no reviews), cart, checkout, payment slip
upload, order history (user), admin product+category CRUD, admin order management
(status: pending -> verified -> shipped -> done).

## Optional scope (Phase 2 — per-client)

reviews, qna, variants, analytics-dashboard, stock-automation, line-notify, pdf-documents, promotions.

## Build order

1. Supabase schema (products, categories, orders, order_items, addresses, users)
2. Auth + profile + address book
3. Product catalog
4. Cart + checkout + slip upload
5. Order history
6. Admin product/category CRUD
7. Admin order management
8. E2E test w/ mock data
9. Enable optional modules per client spec

## Notes

- No client-specific data in core code.
- Verify core works with all optional flags off before enabling any module.
- New client workflow: clone repo -> create new Supabase project -> edit `branding.config.ts` ->
  toggle feature flags per client scope.
