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
- **`products.status` (`draft`/`active`/`archived`) is the only writable lifecycle field.**
  `products.is_active` still exists and every storefront query and RLS policy still reads it, but
  it is now DB-derived: `trg_products_sync_is_active` sets `is_active := (status = 'active')` on
  every insert and update. **Client code must never write `is_active` on `products`** — the trigger
  discards it. It was kept rather than replaced because `products_active_created_idx`, the
  `products: public read` policy and the `product_images: public read` policy all read it, and
  converting it to a `GENERATED` column needs `DROP ... CASCADE`, which would take those policies
  with it. `categories.is_active` and `product_variants.is_active` are untouched and are still
  written directly.
- New products default to `draft`, and **`duplicateProduct`** (`useAdminProductMutations.ts`) always
  lands its copy as `draft` with `sku: null` and a `-copy`/`-copy-N` slug from
  `nextAvailableSlug()` — `slug` and `sku` are both `unique`, so a verbatim copy would fail.
  Images are deliberately not copied; the admin re-uploads them.
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
- **The customer sees the reasons now** — this was an open gap for a while and is not one any
  more. `OrderDetailPage` renders `payment_rejection_reason` above the re-upload form,
  `cancel_reason` when an order is cancelled, and `shipping_carrier` · `tracking_number` once it
  ships. `golden-path.spec.ts` covers all three, including the reject → re-upload bounce, so a
  regression here fails a test rather than going quiet.

## Volume pricing

- `product_price_tiers` (`supabase/migrations/20260831000200_product_price_tiers.sql`) holds
  wholesale quantity breaks as `(product_id, min_quantity, unit_price)`. The applicable tier is the
  one with the **highest `min_quantity` still `<= quantity ordered`**; with none qualifying,
  `products.price` applies. Precedence, highest first: `product_variants.price_override` →
  matching tier → `products.price`.
- **This is core, not an optional module** — there is no feature flag and no `<Feature>` wrapper. A
  wholesale kit that cannot express a quantity break is not a wholesale kit. Its E2E spec
  (`e2e/volume-pricing.spec.ts`) therefore runs unconditionally, unlike the flag-guarded
  `test.skip(!brandConfig.features.x, ...)` specs the Phase 2 modules ship.
- `create_order()` resolves the tier **itself**, inside its `_cart` temp table, under the same
  `for no key update` product lock it already held. `resolveTierPrice()` (`src/lib/priceTiers.ts`)
  expresses the same rule on the client for display only — the standing rule from Variants and
  Promotions applies unchanged: the mutating RPC never trusts a client-side price.
- Two rules live in the `enforce_price_tier_rules` trigger rather than in CHECK constraints,
  because both need a cross-row or cross-table read: **at most 10 tiers per product** (Shopify's
  documented limit) and **`min_quantity > products.min_order_quantity`** (a tier at or below the
  MOQ is unreachable, since every order already starts at the MOQ).
- `CartPage` re-resolves each line's price from the live tiers `useProduct()` already fetches and
  pushes the result into the cart store via **`reconcilePricing`**. That is what keeps
  `useCartSubtotal()` and `CheckoutPage`'s total truthful without either file knowing tiers exist.
  A variant line is skipped — the cart page does not fetch variants, and an override outranks a
  tier anyway.
- `ProductListPage` deliberately still shows the base price. Tier pricing is a detail-page concern,
  matching how Shopify's collection pages behave.
- `useProductPriceTierMutations` **deletes** tiers outright. That does not contradict the
  "deactivate, never delete" rule in the Admin section — that rule is about products and
  categories, which have order history hanging off them. A price tier is a rule, not a record.

## Product CSV import

- `/admin/products/import` (`AdminProductImportPage`) parses client-side and writes nothing until
  the admin confirms the preview. Two pure modules do the risky work and carry the unit tests:
  `src/lib/csv.ts` (`parseCsv`) and `src/core/admin/productCsv.ts` (`parseProductRows`).
- **No CSV dependency was added on purpose.** This kit is cloned per client, so a parser package
  would ship to every clone for one admin screen. `parseCsv` covers quoted fields, doubled `""`
  escapes, commas and newlines inside quotes, LF/CRLF, and the UTF-8 BOM Excel writes. It does not
  support a bare-CR line terminator or a non-comma delimiter.
- **Unknown columns are ignored, never an error** — supplier price lists carry extra columns, and
  rejecting the file over them would make the feature unusable.
- Rows are matched to existing products **by `slug`** (`not null unique`, always present in a valid
  row), never by `sku` (nullable).
- **The insert/update split is a correctness requirement, not an optimisation.** A batched
  `upsert` would rewrite `status` on every row, so a routine monthly price-list refresh would
  silently unpublish the entire live catalogue. Instead: unknown slug -> INSERT with
  `status = 'draft'`; known slug -> per-row UPDATE that **omits `status`** unless the file supplied
  one. Updates stay per-row for exactly this reason; do not "optimise" them into an upsert.
- **An UPDATE writes only the columns the file actually supplied**, which is why
  `parseProductRows` returns `columns` and `useProductImport` takes it. An INSERT uses the full
  payload (a new product needs every field), but pushing that same full payload into an UPDATE
  would write the parser's *defaults* into every omitted column — a two-column
  `name,slug,price` refresh would reset `min_order_quantity`, `units_per_package`,
  `stock_quantity` and `category_id` across the whole catalogue. Same failure class as the
  `status` trap, one column further out.
- `useProductImport` resolves `category_slug` -> `category_id` up front; an unknown category fails
  its own rows rather than importing them uncategorised. A failed insert chunk reports every slug
  in the chunk, since Postgres does not say which row it objected to.

## Catalogue data

- **`src/demo/catalogue.data.json` is the single source of truth for categories and products** —
  6 categories × 6 products. The static showcase reads it through `src/demo/catalogue.ts`, and
  `supabase/seed.sql`'s catalogue block is generated from it. Editing either consumer by hand is
  the mistake: edit the JSON and run `npm run generate:catalogue`.
- **Two generators, both with a `--check` mode wired into `npm run lint`:**
  `scripts/generate-product-art.mjs` writes `public/images/supplymate/products/{slug}.svg` (one per
  product, from that product's `art` spec, via the pure renderer in `scripts/productArt.mjs`), and
  `scripts/generate-seed-catalogue.mjs` rewrites only the block between
  `-- BEGIN generated catalogue` and `-- END generated catalogue` in `supabase/seed.sql`. Variants,
  addresses and the sample orders below that block stay hand-written and reference the fixed
  product ids, so **a product's `id` in the JSON is not free to change** —
  `b1000000-…-0001/0005/0010/0018` are named by the seeded orders.
- **A product's image path is derived, never stored:** `/images/supplymate/products/{slug}.svg`.
  Renaming a slug renames its art; the orphan file **fails `npm run lint`** (the `--check` run of
  `generate-product-art.mjs`) until it is deleted by hand — the generator reports orphans in both
  modes and deletes in neither, so re-running `npm run generate:catalogue` writes the renamed
  file but never removes the old one.
- **This JSON is the demo catalogue, not a client's real one.** It exists so the static showcase
  and `supabase/seed.sql` describe the same thirty-six products instead of drifting; it is not
  where a cloning client's actual inventory goes. `supabase/seed.sql` is local-dev-only (see the
  Supabase section) and is never pushed to a hosted project. A client's real products arrive
  through the admin product UI (`/admin/products`) or the CSV import at
  `/admin/products/import` — both write directly to the `products`/`categories` tables, no JSON
  or generator involved. A client who wants their own photographs in the showcase instead of
  generated line art has to edit code, not data: the derived `.svg` path is expressed in two
  places — `src/demo/catalogue.ts`'s `productImagePath()` and `generate-seed-catalogue.mjs`'s
  own copy of the same formula — and `generate-product-art.mjs --check` runs inside `npm run
  lint`, so every product's `art.shape` must still name a shape `productArt.mjs` knows until that
  pipeline is changed or removed. There is no opt-out flag for this; swapping in real photography
  is a deliberate code change, not a per-client toggle.
- **The six photographic PNGs are category tiles and the hero only.** Product cards use the
  generated line art — thirty-six cards sharing six photos is what made the catalogue read as a
  demo. The SVGs carry literal hex colours and a `system-ui` font stack with Latin-only captions,
  because an `<img>`-loaded SVG cannot reach the page's tokens or a webfont.
- **The drawing's safe area is y 80..560, not the full 640 viewBox.** `.wholesale-product-card img`
  is `aspect-ratio: 4/3` with `object-fit: cover`, so a card throws away the top and bottom eighth
  of the square. That is why the caption baseline sits at 534 — at 558 the descenders of
  "greaseproof" were sliced off on every card — and why a new shape must not reach above y 80.
  The detail page is `aspect-square`, so it will not show you this; judge new art on `/#/shop`.
- **Generated SQL writes `products.status`, never `is_active`** (`trg_products_sync_is_active`
  derives it), and every product carries a distinct non-empty `sku` — `products.sku` is `unique`,
  so a blank one breaks on the second row.
- Two showcase E2E specs are pinned to catalogue values: `static-showcase.spec.ts` uses
  `clear-cup-16oz`'s exact name and `thermal-label-50x30`'s MOQ of 6. `clear-cup-16oz` must also
  keep `sort_order = 1` — several Supabase specs buy "the first product on `/shop`".
- **The art-coverage test is `scripts/catalogueArt.test.mjs`, not `src/demo/catalogueArt.test.ts`,
  and moving it back into `src/` breaks the build.** `tsconfig.app.json` keeps
  `types: ["vite/client"]` with no `node` entry, so a `node:fs` import from inside `src/` fails
  `npm run typecheck`. Plain ESM under `scripts/` is picked up by vitest's default include glob
  and stays outside the app's TypeScript program.
- `scripts/productArt.test.mjs` renders all 36 products and asserts that no element repeats an
  attribute name. That is not redundant with the other assertions: a duplicate `stroke-width`
  (from combining a shared `soft`/`mark` constant with an explicit override) once shipped and made
  two SVGs fail to load as `<img>` — XML well-formedness is the invariant being protected.
- `ShowcaseProductCard`'s image `<Link>` is `aria-hidden` + `tabIndex={-1}` **on purpose**: it
  duplicates the title link's destination and accessible name directly below it, and the standard
  fix for a redundant adjacent link is to keep exactly one of the pair in the accessibility tree.
  Do not "restore" it.

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

## VAT

- **Catalogue prices are VAT-exclusive.** Tax is added at order time, never folded into a price.
  Base = `subtotal - discount_total + shipping_fee` — discounts reduce the taxable amount and
  delivery is part of the taxable supply. `total = base + vat_total`.
- The rate lives in `calc_vat()` (`supabase/migrations/20260831000500_vat.sql`), marked
  **EDIT PER CLIENT** like `calc_shipping_fee()`. A shop that is not VAT-registered returns 0 and
  every total collapses to the old arithmetic with no other change.
- **The cart and checkout deliberately do not compute VAT.** They say prices exclude it and leave
  the figure to `create_order()`, exactly as they already do for shipping — a second
  implementation on the client is how the two drift apart.
- **Existing orders are not backfilled.** `vat_total` defaults to 0, which still satisfies the
  identity, and those orders were placed when the shop charged no VAT. Rewriting them would
  falsify what the buyer agreed to pay.
- **Trap that cost a debugging round: `orders_total_check` is NOT the total formula.** It is
  Postgres's auto-generated name for the inline `check (total >= 0)` on the column. The formula is
  `orders_total_identity`, declared by name in `20250101000400_orders.sql`. Dropping the wrong one
  removes the non-negative guard *and* leaves the old formula in place — and `supabase migration
  up` will not catch it, because nothing violates the stale formula until an order carries tax.
  Only `db reset` does, because `seed.sql` creates its orders through `create_order()`. Any future
  change to how `total` is composed must edit `orders_total_identity`.

## PromptPay (static QR)

- **Static means the QR carries no amount.** The shop shows one fixed image, the buyer scans it,
  types the amount into their banking app themselves, and uploads a slip — the same
  `attach_payment_slip()` path a bank transfer takes. There is no gateway, no webhook and no
  auto-confirmation, so "verified in a minute" is not achievable here by definition: nothing tells
  the shop who paid until a human reads the slip.
- The QR lives in `brandConfig.promptPay.qrImageUrl`, not the database — it is per-shop branding,
  and **an empty string is the off switch**: `CheckoutPage` never offers the method without it, so
  a client who does not use PromptPay needs no flag. Same shape as `lineNotify` using vault-secret
  presence rather than a feature flag.
- `orders.payment_method` accepts `('bank_transfer', 'promptpay')`. `create_order()` takes
  `p_payment_method` and **re-validates it server-side** rather than trusting the client, and
  `enforce_order_immutability()` freezes it: an admin lifecycle update can change status, tracking
  and cancel reason, but never how the buyer said they would pay.
- **The 6-argument `create_order` overload had to be dropped** before adding the 7-argument one —
  leaving both makes the call ambiguous to PostgREST whenever a client omits the new parameter.
  Any future parameter addition needs the same `drop function if exists` first.
- The demo QR in `public/images/supplymate/` is **deliberately not scannable** and says so on its
  face. A placeholder that looked like a real payment target could be scanned and paid to by
  someone testing the demo.

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

## Design system

Both surfaces — the Supabase app and the static showcase — draw from one set of tokens in
`src/index.css` and one set of primitives in `src/components/ui/`.

- **The palette is "Ledger": every neutral sits on one indigo hue (265) at chroma 0–0.02, and the
  primary action is ink-filled rather than brand-coloured.** Colour is spent on exactly two things:
  order status and product photography. The reasoning is in the comment above the token block, and
  it matters — the previous warm-cream ground fought the paper (a delivery note, a tax invoice) that
  a buyer holds next to the screen. Don't reintroduce a tinted background "for warmth".
- **`--border` and `--input` are deliberately different weights.** `--border` is a quiet hairline
  between rows with no contrast floor; `--input` bounds an interactive control and must clear WCAG
  1.4.11's 3:1 (measured 3.24:1 on white). Don't collapse them.
- **Twelve primitives, and no component should hand-roll what they cover**: `alert` `badge` `button`
  `checkbox` `empty-state` `field` `input` `label` `select` `skeleton` `table` `textarea`. `Field`
  in particular owns the label/hint/error/`aria-describedby`/`aria-invalid` wiring that seventeen
  pages each used to get partly wrong. There is no `dialog` and there should not be one: the
  list-or-form convention replaces modals here.
- **The notice (`components/ui/toaster.tsx`) never disappears on a timer.** Feedback that vanishes
  makes people race the clock to check what they just did, and an auto-dismissing message with a
  button in it is both a WCAG 2.2.1 timing problem and unreachable for a screen reader. It shows one
  message, replaced rather than stacked, and splits itself: a text-only `role="status"` live region
  for the announcement, ordinary DOM for the controls. On mobile it sits in normal flow at the top
  of the page — floating it covered the sticky buy bar, and floating it at the top covered the nav.
- **Mobile gets 44px touch targets, desktop keeps its density** (`min-h-11 sm:min-h-9`). The buyer
  is on a phone in a prep kitchen; the admin is mouse-first.
- **Two CSS cascade traps, each hit once here:** a rule *outside* any `@layer` beats every layered
  utility no matter its specificity (an unlayered `input { border-color: … }` silently ate every
  Tailwind border utility), and a rule in `@layer base` *loses* to `@layer utilities` no matter its
  specificity (a `:where(…):user-invalid` rule in base matched its selector and painted nothing).
  Validation and state styles belong on the primitives, in the utilities layer, next to the class
  they must beat.
- **`aria-invalid:` is not a built-in Tailwind variant** — use `aria-[invalid=true]:`. `:user-invalid`
  needs `[&:user-invalid]:`, and only matches after genuine user interaction, so a synthetic
  focus/blur will not trigger it.

## Showcase design system

The static showcase (`src/showcase/`, mounted by `src/main.tsx`) carries two rules that were
established by re-deriving them the hard way — both regress silently, neither is caught by a test
unless you know to look.

- **One standing demo disclosure per page, not four.** `<ShowcaseNotice id="showcase-demo-notice" />`
  renders exactly once, in `ShowcaseApp`'s `<main>`, and it is the only `role="note"` on any page —
  the header's `วิธีสั่งซื้อ (เดโม)` link routes home, where that notice is what the buyer lands on,
  and `e2e/task-3-shell.spec.ts` asserts both the id's uniqueness and a note count of 1. A page at a point of commit (cart, checkout)
  restates only the part that applies to the button in front of the buyer, via
  `.showcase-commit-caption` — a short caption, **not** a second `ShowcaseNotice`. The utility strip
  at the top of the header carries the disclosure on every viewport, mobile included; do not hide
  either of its spans behind a media query (an earlier `display: none` below 48rem dropped the
  local-data-only line exactly where the page was hardest to read, against PRODUCT.md's principle 3).
  Repeating the same sentence four times does not make the demo boundary clearer — it trains buyers
  to skip it.
- **Showcase typography goes through the tokens in `src/index.css`, never Tailwind size/weight
  utilities.** `--text-page-title` / `--text-section-title` / `--text-card-title` / `--text-eyebrow`
  / `--text-meta` / `--text-fine` plus `--weight-title` (700) and `--weight-strong` (650) are the
  single scale; the `.showcase-page-title`, `.showcase-section-title`, `.showcase-eyebrow` and
  `.showcase-lede` classes in `showcase.css` are how TSX consumes them. Tailwind still handles
  layout (grid, flex, gap, spacing) — that split is deliberate. Writing `text-3xl font-semibold` in
  a showcase component reintroduces the exact drift this replaced: `font-semibold` is 600 while the
  CSS side used 700/720/750, so headings at the same level rendered at different weights depending
  on which file styled them.

Two smaller invariants worth not rediscovering:

- **`overflow-x: hidden` belongs on `html` only, never on `body` too.** Putting it on both makes
  `body` its own scroll container, and every `position: sticky` descendant (the header, the
  catalogue toolbar) then has a scrolling ancestor that never scrolls — they silently stop sticking
  with no error and no failing test.
- **`--showcase-header-height` (`showcase.css`, on `:root`) is what the sticky catalogue toolbar
  offsets against.** It is a hand-measured constant; if the header gains or loses a row, update it
  or the toolbar parks underneath the header.

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

- **Which app runs is a build-time switch.** `src/main.tsx` branches on `VITE_SHOWCASE_MODE`,
  defined unconditionally in `vite.config.ts`. The **static showcase is the default** because it
  runs with no Supabase project configured — `src/lib/supabase.ts` throws at module scope without
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, so a fresh clone or the Pages deploy would
  white-screen if the real app were the default. Both entries are imported dynamically and the
  branch is on a build-time literal, so Rollup drops the unused one entirely — that is what keeps
  Supabase code out of the Pages bundle, which `scripts/assert-static-showcase.mjs` enforces.
- `npm run dev` — start the dev server (showcase)
- `npm run dev:app` — start the dev server with the real Supabase-backed app
- `npm run build:app` — production build of the real app
- `npm run build` — typecheck (`tsc -b`) + production build
- `npm run typecheck` — typecheck only
- `npm run lint` — oxlint + `scripts/check-core-boundary.mjs` (fails if `src/core` imports from
  `src/modules/optional`)
- `npm run preview` — preview the production build
- `npm run test:e2e` — run the Playwright E2E suite (see Testing below)

## Testing

- **Always run `npm run test:e2e`, never bare `npx playwright test`** — only the npm script runs
  `pretest:e2e`, and without the DB reset the promotions and variants specs fail on rows left by the
  previous run. That failure looks like a code regression and is not one.
- **A stale locator presents as a 60-second timeout, not an assertion failure.** Three separate
  times in this codebase a spec waiting on renamed text (a button label, a `getByLabel`, an
  `(inactive)` substring that became a `Badge`) read as a slow test. Open
  `test-results/*/error-context.md` before calling anything a flake. Real flakes here look
  different: a cold Supabase makes the golden path take ~25s against a ~3s warm run, which is why
  the Playwright timeout is 60s rather than the 30s default.
- **Two Playwright projects, two dev servers.** `chromium` serves the real app on :5174 with
  `VITE_SHOWCASE_MODE=false`; `showcase` serves the static showcase on :5175. One server cannot host
  both, because the entry is chosen at build time. `E2E_SERVERS=showcase` (used by
  `npm run test:showcase-e2e`) starts only the server that run needs — booting both for a
  single-project run wastes a Supabase-backed server and leaves an orphan on the port if Playwright
  fails to reap it.
- `npm run test:e2e` runs the Playwright suite in `e2e/`, single worker, against a **local Supabase
  stack only** — never point it at a
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
- **A spec that creates a product must set `sort_order` high (9000) and give it stock.** The suite
  shares one database and several specs buy "the first product on `/shop`", which sorts by
  `sort_order asc`. Seeded products start at 1, so a probe product left at the default `0` becomes
  that first product — and if it also has `stock_quantity = 0` the detail page renders a disabled
  "Out of stock" button, breaking every later spec with an error that points nowhere near the spec
  that caused it. `product-import`/`volume-pricing`/`product-status-duplicate` all do this.
- **Filling the admin product form: `#name`, then `blur()`, then `#slug`.** `AdminProductForm`
  auto-generates the slug on the name field's blur, and filling `#slug` immediately after `#name`
  races that handler and lands a doubled slug (`foofoo`), which then 404s on `/products/{slug}`.
  Assert `toHaveValue(slug)` afterwards so the race can never fail silently again.
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
  file under `e2e/` that opens with `test.skip(!brandConfig.features.x, '...')`, so it activates
  automatically the moment a client flips the flag on. **`reviews` now ships `true`**, so its spec
  runs on every `npm run test:e2e`; `qna`, `analyticsDashboard` and `pdfDocuments` are still off and
  their specs still skip. A spec that has been sitting behind an off flag has not been run — when
  you turn a flag on, expect the spec to be stale, and read the failure rather than assuming a
  slow test is a flake (see Testing). Keep new modules on this pattern rather than reverting to a
  scratch spec.
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
