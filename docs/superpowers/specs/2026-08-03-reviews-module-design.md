# Phase 2 — Reviews Module: Design

## Context

This is the first of four Phase 2 optional modules requested (Reviews, Variants, Promotions, LINE
Notify), built one at a time through the full brainstorm → spec → plan → build → review cycle. Per
CLAUDE.md's architecture, optional modules live in `modules/optional/{name}/`, toggled via
`config/branding.config.ts`'s `features.reviews` flag (currently `false`), gated through the
existing `<Feature flag="...">` + `useFeature()` + `React.lazy()` machinery (already built in
Step 0 — `src/lib/Feature.tsx`, `src/lib/useFeature.ts`), and `src/core` must never import from
`src/modules/optional`.

This module adds product reviews to the Phase 1 core catalog (which currently has none): customers
who actually bought a product can leave a star rating and optional comment, visible to everyone
(including guests) on that product's detail page.

## Decisions

- **Verified-purchase only.** Only a customer with a `done` order containing the product may review
  it — not any logged-in user. Matches standard e-commerce practice and prevents drive-by reviews.
- **No moderation queue.** Reviews publish immediately — no `pending → approved` admin workflow.
  Admin retains a lightweight **hide** capability (never delete), reusing this project's existing
  "deactivate, never delete" convention from products/categories.
- **One review per customer per product, editable.** A customer who already reviewed a product gets
  their existing review pre-filled for editing when they return to write another, rather than
  creating a duplicate — enforced at the DB level via a `unique (product_id, user_id)` constraint,
  not just app logic.
- **Two entry points, one underlying form.** "Write a review" is reachable both from the product
  detail page directly and from a `done` order's line items in order history — both route to the
  same review UI on the product detail page; order history only supplies a deep link
  (`/products/:slug?review=1`), it doesn't duplicate the form.
- **Scope boundary:** no review display on the product *list* page (avg rating badges on cards) —
  only the detail page. No photo/image uploads on reviews. No admin `/admin/reviews` management
  route — hiding a review is a button inline on the product page's own review list, visible only to
  an admin viewing that page.

## Schema

New migration, `public.reviews`:

| column       | type                    | notes                                            |
|--------------|-------------------------|---------------------------------------------------|
| `id`         | `uuid pk default gen_random_uuid()` |                                       |
| `product_id` | `uuid not null references products(id)` |                                   |
| `user_id`    | `uuid not null references profiles(id)` |                                   |
| `rating`     | `smallint not null check (rating between 1 and 5)` |                       |
| `comment`    | `text` (nullable)       | optional free text                                 |
| `is_active`  | `boolean not null default true` | admin "hide" toggle, never a hard delete    |
| `created_at` | `timestamptz not null default now()` |                                       |
| `updated_at` | `timestamptz not null default now()` | bumped by the upsert RPC on edit         |

`unique (product_id, user_id)` — the DB-level guarantee behind "one review per customer per
product," and what makes the write path a clean upsert.

**RLS:**
- `select`: public (`anon` + `authenticated`), restricted to `is_active = true` for non-admins;
  `is_admin()` sees everything (same admin-bypass shape as every other admin-visible table in this
  project — see the `orders`/`admin queries` precedent in CLAUDE.md).
- `update`: admin-only, and only for flipping `is_active` (no product/product_id/rating tampering
  from the admin side needed — enforced by only ever issuing `update ... set is_active = ...` from
  the admin UI, matching how `AdminOrderMutations` only ever sends a narrow field set today).
- No direct `insert`/general `update` policy for regular users — all customer writes go through the
  RPC below, the same shape as `orders` having no direct insert policy.

**`submit_review(p_product_id uuid, p_rating smallint, p_comment text)` RPC** (`SECURITY DEFINER`,
mirroring `create_order`/`attach_payment_slip`):
1. Validates `p_rating between 1 and 5`.
2. Checks the caller (`auth.uid()`) has at least one `orders` row with `status = 'done'` whose
   `order_items` include `p_product_id` — the actual eligibility gate, done server-side so the
   order-history entry point never needs to be trusted (it's a UI convenience, not a security
   boundary).
3. `insert ... on conflict (product_id, user_id) do update set rating = excluded.rating, comment =
   excluded.comment, updated_at = now()` — the upsert that makes "already reviewed → edit" work
   without the client needing to know in advance whether this is a create or an edit.
4. Raises a friendly error (via the existing `getErrorMessage()` client-side pattern) if step 2
   fails — "You can only review products you've purchased."

## UI

- **`ProductDetailPage.tsx` (core, `src/core/catalog/`)** gets one new block at the bottom:
  ```tsx
  const Reviews = lazy(() => import('@/modules/optional/reviews'))
  // ...
  <Feature flag="reviews">
    <Suspense fallback={null}>
      <Reviews productId={product.id} />
    </Suspense>
  </Feature>
  ```
  This is the only change to a core file. The dynamic `import()` form is confirmed compatible with
  `scripts/check-core-boundary.mjs` (its regex matches static `from '...'` imports only — this is
  exactly the pattern `Feature.tsx`'s own doc comment already demonstrates).
- **`src/modules/optional/reviews/`** (new module, default-exports the `Reviews` component):
  - Average rating + review count near the top (e.g. "4.5 ★ (12 reviews)").
  - List of active reviews below (reviewer name, star rating, comment, date).
  - If the signed-in user is eligible (has a `done` order for this product) and other loading
    states have resolved: a form (star picker + optional comment textarea, "Submit review" /
    "Update review" depending on whether they already have one). Ineligible or signed-out users see
    no form — just the list.
  - If the current user is an admin (`useProfile()`, same hook every other admin surface uses): a
    small "Hide" / "Unhide" button next to each review, calling the `is_active` toggle.
  - Reads `?review=1` from the URL (via `useSearchParams`, matching the existing catalog-page
    convention) to auto-scroll to and focus the form on mount, for the order-history deep link.
- **`OrderDetailPage.tsx` / `OrderListPage.tsx` (core, `src/core/orders/`)**: for `done` orders,
  each line item gets a "Write a review" link to `/products/:productSlug?review=1` — gated the same
  `<Feature flag="reviews">` way, since these are core files that must render correctly with the
  flag off (the link simply doesn't render). Requires each order line to carry `product_slug`
  (currently `order_items` snapshots `product_name` but not the slug — the query needs a join back
  to `products.slug` via `product_id`, or a new snapshotted `product_slug` column; the plan will
  decide which based on whether `order_items.product_id` reliably still resolves to a live product
  row, which it does per the existing snapshot-immutability design).

## Data flow

1. Guest or customer loads `/products/:slug` → `ProductDetailPage` renders the product, and (flag
   on) lazy-loads `Reviews`, which fetches `{ average, count, list }` for that `product_id`.
2. Eligible signed-in customer submits the form → `supabase.rpc('submit_review', {...})` → RLS-free
   `SECURITY DEFINER` path validates eligibility and upserts → query invalidates → list/average
   re-fetch.
3. Admin viewing the same page sees a "Hide" button per review → direct
   `supabase.from('reviews').update({is_active: false}).eq('id', ...)` (admin RLS policy) → query
   invalidates.
4. Customer on `/orders` or `/orders/:orderId` with a `done` order → clicks "Write a review" on a
   line item → navigates to `/products/:slug?review=1` → `Reviews` module auto-opens/scrolls to the
   form (the RPC still re-validates eligibility regardless of how they arrived).

## Testing

- Extend the existing Playwright suite (`e2e/`) rather than starting a separate harness: after
  Step 8's golden path reaches `done`, a follow-up spec (or an extension of `golden-path.spec.ts`)
  has the customer visit the product page, leave a review, and asserts it renders with the correct
  rating/comment. A second spec (or assertion) confirms an account with **no** `done` order for that
  product sees no review form — the eligibility gate, checked from the UI down to the RPC.
- With `features.reviews = false` (the flag's current default), confirm `ProductDetailPage` and
  order-history pages render identically to today and that `modules/optional/reviews` never appears
  in the production bundle (grep `dist/assets/*.js` for a distinctive string from the module, same
  verification CLAUDE.md's "Core scope" section already calls for before any module ships).

## Out of scope

- Admin review-management route (`/admin/reviews`) — hiding is inline on the product page instead.
- Photo/image uploads on reviews.
- Average-rating display on the product *list* page.
- Review "helpful" voting, replies, or any moderation workflow beyond hide/unhide.
- Enabling the `reviews` feature flag in `branding.config.ts` by default — this stays a per-client
  decision; the plan ships the module and the wiring, not the flag flip.
