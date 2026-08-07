# Phase 2 — Variants Module: Design

## Context

Second of four Phase 2 optional modules (Reviews is done and merged; Promotions and LINE Notify
remain). Per CLAUDE.md's "Cart, checkout, payment slip" section: "Every cart line always has
`variantId: null` (no variant picker exists yet — Phase 2)." Per Core rules ("Schema should
anticipate optional fields"), the schema already has `product_variants` and `variant_id` threaded
through cart/order types — this module activates that existing plumbing, it doesn't build it.

## Scope discovery (from reading the real schema/code, not assumed)

This module needs almost no database work:

- `public.product_variants` (created in Step 1) already has full, correctly-shaped RLS from
  `20250101000700_advisor_fixes.sql`'s split-policy convention (`"product_variants: read"` using
  `public.is_admin() or (is_active and <parent product is active>)`, plus separate admin
  insert/update/delete policies) — no new migration needed.
- `create_order()`'s pricing query already `left join`s `product_variants` and uses
  `coalesce(v.price_override, p.price)` — checkout pricing already correctly handles variants
  server-side. No RPC changes needed.
- `order_items.variant_name` already snapshots automatically when `create_order()` is called with a
  non-null `variant_id`. No new column needed.
- `cartStore.ts`'s `CartItem`/`addItem`/`removeItem`/`updateQuantity`/`sameLine` are all already
  generic over `variantId: string | null` — the store itself has zero hardcoded nulls. The
  hardcoding lives only at the `ProductDetailPage.tsx` call site (`variantId: null` in the `addItem`
  call).
- `CheckoutPage.tsx`'s `placeOrder` mutation already maps `item.variantId` straight into
  `p_items` — no changes needed there either.

This is overwhelmingly a UI-layer module: an admin variant-management panel, a customer-facing
selector, and a handful of one-line "show the variant name if there is one" additions to already-
generic core display code.

## Decisions

- **Variant selection is required before "Add to cart"** when a product has any active variants —
  matches standard online retail practice (must pick size/color before purchasing).
- **Flat single-list variant display**, keyed off each variant's own `name` field (e.g. "Black /
  M", entered as free text by the admin) — not a multi-axis Color+Size dropdown matrix. The
  `options` jsonb column stays in the schema for a possible future faceted-filter feature, but
  nothing in this module reads or writes it.
- **Stock tracking moves to the variant level once a product has variants.** A variant-less product
  keeps today's `product.track_inventory`/`product.stock_quantity` behavior unchanged. A product
  *with* variants determines "in stock" from the *selected* variant's `stock_quantity` — the base
  product's own stock fields become informational/unused for that product once it has variants
  (this is an admin data-entry convention, not a new constraint — a client can still leave a
  product's own `stock_quantity` at whatever value, it's simply not consulted once variants exist).
- **Variants are deactivated, never deleted**, from the admin UI (`is_active` toggle) — matches the
  established products/categories convention.

## Architecture: the core-wiring seam

Unlike Reviews (a self-contained section appended below existing content), Variants must sit
*inside* the existing add-to-cart flow — the button's enabled state and the displayed price both
depend on which variant is selected. Since core can never statically import from
`modules/optional`, the lazy-loaded `VariantSelector` becomes a **controlled child**: it runs its
own `useProductVariants(productId)` query and reports upward via two callback props —
`onVariantsLoaded(variants: Variant[])` (lets `ProductDetailPage.tsx` learn whether this product has
any variants at all — defaults to none when the flag is off or the component never mounts) and
`onSelect(variant: Variant | null)`. `ProductDetailPage.tsx` (core) owns the actual `selectedVariant`
state and uses it to compute the displayed price, the out-of-stock check, and the `addItem(...)`
payload. No core file ever imports variant-selection logic; with the flag off, nothing ever calls
`onVariantsLoaded`, so `hasVariants` stays `false` and behavior is byte-identical to today.

## Core file changes (all small, generic, and safe without `<Feature>` gating on the *display* side)

- **`cartStore.ts`**: add `variantName: string | null` to the `CartItem` interface — the one real
  gap. (The store's logic itself needs no changes — already generic over `variantId`.)
- **`ProductDetailPage.tsx`**: lifted `selectedVariant`/`hasVariants` state; price display becomes
  `selectedVariant?.priceOverride ?? Number(product.price)`; "Add to cart" disables when
  `hasVariants && !selectedVariant`, or when a variant is selected and its `stockQuantity <= 0`; a
  `<Feature flag="variants"><Suspense fallback={null}><VariantSelector productId={product.id}
  onVariantsLoaded={...} onSelect={...} /></Suspense></Feature>` block sits between the price and
  the quantity/add-to-cart row.
- **`CartPage.tsx`, `CheckoutPage.tsx`, `OrderDetailPage.tsx`, `AdminOrderDetailPage.tsx`**: each
  gets a one-line conditional showing the variant name next to the product name
  (`item.variantName`/`item.variant_name` — these fields are simply always `null` with the flag
  off, so the conditional is inert, no `<Feature>` wrapper needed — the same reasoning CLAUDE.md
  already applies to other always-present-but-often-null snapshot fields).
- **`AdminProductListPage.tsx`**: mirrors exactly how `ProductImagesPanel` is already wired in for
  an existing product being edited — adds a `<Feature flag="variants"><Suspense fallback={null}>
  <VariantsPanel productId={editing.id} /></Suspense></Feature>` block alongside it.

## The module (`src/modules/optional/variants/`)

- **`useProductVariants(productId)`**: public-facing query (active variants only, for the customer
  selector) and reused (with RLS naturally returning more for an admin session) by the admin panel.
- **`useVariantMutations(productId)`**: `createVariant`, `updateVariant`, `deactivateVariant`
  (never a hard delete).
- **`VariantsPanel`**: admin list + inline add/edit form (`name`, `sku`, `price_override`,
  `stock_quantity`) — mirrors the existing list-or-form single-page pattern
  (`AddressBookPage`/`AdminCategoryListPage`/`AdminProductListPage`) rather than a route-per-form.
- **`VariantSelector`**: customer-facing picker — a list of buttons/radio-style options, one per
  active variant, showing its `name`; disables (but still shows, struck through or similarly
  marked) any variant whose `stock_quantity <= 0`.

## Testing

Extend the E2E suite with a flag-guarded `e2e/variants.spec.ts` (same `test.skip(!brandConfig
.features.variants, ...)` pattern established for Reviews) covering: admin creates two variants for
a product, customer sees the selector, "Add to cart" is disabled until a variant is picked, cart/
checkout/order-detail all show the variant name, and an admin-deactivated variant disappears from
the customer-facing selector.

## Out of scope

- `options` jsonb-driven faceted filtering or a multi-axis (Color × Size) selector UI.
- Per-variant images.
- Bulk variant generation (e.g. auto-generating all Color×Size combinations from two option lists).
- Enabling the `variants` flag by default — stays a per-client decision, same as Reviews.
