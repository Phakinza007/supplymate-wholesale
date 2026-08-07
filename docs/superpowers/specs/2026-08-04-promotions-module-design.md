# Phase 2 — Promotions Module: Design

## Context

Third of four Phase 2 optional modules (Reviews and Variants are done and merged; LINE Notify
remains). Unlike Reviews (zero migrations) and Variants (one migration, discovered mid-plan),
Promotions needs real schema work from the start: there is no `promotions` table at all, and
`create_order()` — the most safety-critical RPC in the project, since CLAUDE.md repeatedly
documents that pricing must never be client-expressible — currently hardcodes `discount_total: 0`
with no discount-code parameter.

Read in full before designing (not assumed from the `orders.discount_total` column comment alone):
- The **current** `create_order()`, as re-declared by the Variants module's own fix migration
  (`supabase/migrations/20250101001000_variant_order_validation.sql`) — this, not the original
  `20250101000500_order_functions.sql` version, is the real current body any new change must be
  based on.
- `enforce_order_immutability()` (`20250101000700_advisor_fixes.sql`): `discount_total` is
  mutable while `status = 'pending'`, then locked to `old.discount_total` once status advances.
  Customers have no UPDATE policy on `orders` at all, so in practice `discount_total` can only ever
  be set once, at `create_order()` time — there is currently no path (admin or customer) that ever
  changes it from `0`.
- `CheckoutPage.tsx`: currently no code-entry UI; the order summary shows line items + subtotal
  only (shipping/total are computed server-side and shown for the first time on the confirmation
  page).

## Decisions

- **Both discount types**: percent and fixed-amount codes, admin's choice per code.
- **Both usage limits, each optional**: `max_uses` (a total redemption cap across all customers)
  and `expires_at` — an admin can set either, both, or neither.
- **Optional `min_subtotal`** per code (a common pairing with promo codes, cheap to add).
- **No public read access to the `promotions` table at all** — unlike products/reviews, a
  customer never queries this table directly; every interaction goes through an RPC, so a code's
  existence, rules, or remaining uses are never discoverable by browsing the API.
- **Two RPCs, defense-in-depth** (the same lesson the Variants module's final review reinforced —
  "a client-visible check and a server-side enforcement of the same rule must both exist,
  independently"):
  - `validate_promo_code(p_code, p_subtotal)` — read-only, live UI feedback only, never mutates
    `uses_count`.
  - `create_order(...)`'s new `p_promo_code` parameter **re-validates from scratch** inside the
    order-creation transaction, never trusting the client's earlier "valid" response from
    `validate_promo_code`.
- **Race-safe redemption counting**: `create_order()` locks the promotion row (`for update`) before
  checking `max_uses`, the same row-locking pattern the function already uses on the product row
  during pricing — two concurrent checkouts against the last remaining use of a capped code cannot
  both succeed.
- **A fixed-amount discount is clamped to the subtotal** — it can never produce a negative total.
- **`orders.promo_code`** (new nullable snapshot column) records which code was applied, added to
  `enforce_order_immutability()`'s always-locked field list (alongside `subtotal`,
  `shipping_address`) — a promo can never be attached or swapped after order creation, matching
  every other financial field's immutability guarantee.
- **Codes are case-insensitively unique** (`unique index on upper(code)`) — comparison in both RPCs
  is via `upper(code) = upper(p_code)`, so "SAVE10" and "save10" can't coexist as distinct codes and
  a customer's exact capitalization never matters.
- **Out of scope**: per-customer usage limits (one redemption per account), stacking multiple
  codes on one order, product/category-scoped discounts. All deferred — same YAGNI discipline as
  the prior two modules.

## Schema

New migration, `public.promotions`:

| column | type | notes |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `code` | `text not null` | case-insensitive unique via a separate index, not a column constraint |
| `discount_type` | `text not null check (discount_type in ('percent', 'fixed'))` | |
| `discount_value` | `numeric(12,2) not null check (discount_value > 0)` | percent: 0–100 implied by a second check; fixed: any positive amount, clamped at apply-time |
| `min_subtotal` | `numeric(12,2)` nullable | |
| `max_uses` | `integer` nullable | null = unlimited |
| `uses_count` | `integer not null default 0` | incremented only by `create_order()` |
| `expires_at` | `timestamptz` nullable | null = never expires |
| `is_active` | `boolean not null default true` | admin deactivate, never delete — same convention as every other admin-managed table |
| `created_at`, `updated_at` | `timestamptz` | standard `set_updated_at()` trigger |

`create unique index promotions_code_unique_idx on public.promotions (upper(code));`

RLS: admin-only, full split-policy shape (`select`/`insert`/`update`/`delete` to `authenticated`
gated on `public.is_admin()`) — matching the post-`20250101000700` convention, no `anon`/customer
grant of any kind.

`orders.promo_code text` (nullable) added via `alter table`; `enforce_order_immutability()` gets
`new.promo_code := old.promo_code;` added unconditionally (not just past `'pending'`, since a promo
is set once at creation and never meant to change at all, unlike `discount_total`/`shipping_fee`
which are pending-mutable today for other reasons this module doesn't touch).

## RPCs

`validate_promo_code(p_code text, p_subtotal numeric) returns jsonb` (or a typed row — the plan
decides the exact return shape) — checks `is_active`, `expires_at`, `max_uses` vs `uses_count`,
`min_subtotal`, returns enough for the UI to show "10% off" / "฿50 off" and the computed discount
amount, or a reason it's invalid. `security definer`, callable by `authenticated` only (no reason
for `anon` to probe codes pre-login, though checkout itself already requires auth).

`create_order(...)` gains `p_promo_code text default null` as its final parameter (additive,
backward-compatible with existing call sites that omit it). When non-null: locks the promotion row,
re-runs the exact same validity checks as `validate_promo_code` (duplicated logic is acceptable
here — these are two different trust contexts, not a DRY violation, the same reasoning that already
justifies `create_order()` re-pricing every cart line instead of trusting client-sent prices),
computes and clamps the discount, sets `discount_total`/`promo_code` on the inserted order, updates
`total = subtotal - discount_total + shipping_fee`, and increments `uses_count`. An invalid code at
this stage raises a clear, distinct error message from "cart is empty"/"one or more items are
unavailable" — something like `'promo code is invalid or no longer available'`.

## UI

- **Admin** (`src/modules/optional/promotions/`): a genuinely new top-level section, not a
  sub-panel — `/admin/promotions`, list-or-form pattern matching `AdminCategoryListPage`. Added to
  `AdminLayout.tsx`'s nav array only when `useFeature('promotions')` is true (a plain conditional
  array entry — no lazy-loading needed for a nav link itself, since it renders no optional-module
  code). The route in `App.tsx` renders a lazy-loaded, `<Feature flag="promotions">`-gated
  `PromotionsAdminPage`.
- **Customer**: `CheckoutPage.tsx` gets a code input + "Apply" button in the order summary
  (`<Feature flag="promotions">`-gated, lazy-loaded, same controlled-child shape the Variants
  module established — the applied code/discount amount is lifted into `CheckoutPage`'s own state
  so `placeOrder`'s RPC call can include `p_promo_code`), calling `validate_promo_code` for
  immediate "10% off applied" / "Code expired" feedback before the customer commits to placing the
  order.
- **`OrderDetailPage.tsx` / `AdminOrderDetailPage.tsx`**: both already render a subtotal/shipping/
  total breakdown — add an ungated "Discount" line (shown only when `discount_total > 0`) plus the
  applied `promo_code`. No `<Feature>` wrapper needed, same reasoning as variant-name display: these
  fields are simply always zero/null with the flag off.

## Testing

Flag-guarded `e2e/promotions.spec.ts` (same `test.skip(!brandConfig.features.promotions, ...)`
pattern established by Reviews/Variants), covering: admin creates a percent code and a fixed code,
customer applies each at checkout and sees the discount reflected through to the order detail page,
an expired/inactive/over-limit code is rejected with a clear message, and — mirroring the exact
regression class the Variants module's final review caught — a code that becomes invalid between
`validate_promo_code` and actual checkout (e.g. deactivated mid-session) fails the order cleanly
rather than silently succeeding at full price or at a stale discount.

## Out of scope

- Per-customer / per-account usage limits.
- Multiple codes stacked on one order.
- Product- or category-scoped discounts (a code that only applies to certain items).
- Automatic/rule-based promotions (e.g. "10% off orders over ฿1000" applied without a code) —
  `min_subtotal` here is a *gate* on a code, not an automatic discount.
- Enabling the `promotions` flag by default — same per-client decision as every prior module.
