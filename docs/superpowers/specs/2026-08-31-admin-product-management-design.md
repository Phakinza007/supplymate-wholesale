# Admin Product Management — Design

**Date:** 2026-08-31
**Status:** approved
**Plans:** three, executed in order —
`docs/superpowers/plans/2026-08-31-product-status-and-duplicate.md`,
`docs/superpowers/plans/2026-08-31-volume-pricing.md`,
`docs/superpowers/plans/2026-08-31-product-csv-import.md`

## Why

Research into how established platforms (Shopify, Shopify B2B, WooCommerce,
Medusa) handle admin product management surfaced four gaps in SupplyMate's
current `/admin/products` flow. Three are in scope here.

| Gap | Industry norm | SupplyMate today |
| --- | --- | --- |
| Product lifecycle | Draft / Active / Archived | `is_active` boolean only |
| Adding a near-identical product | "Duplicate" action, copy lands as Draft | retype every field |
| Wholesale price breaks | up to 10 quantity tiers per product | one flat price |
| Catalogue-scale data entry | CSV import (~1s/product vs 8–12min manual) | one product at a time |

The fourth researched gap — an `increment` quantity rule distinct from
`min_order_quantity` — is deliberately **out of scope**. It changes the
customer-facing quantity input contract in `ProductDetailPage` and `CartPage`
and deserves its own design pass.

## Scope

Three independent subsystems, each shipping working software on its own:

1. **Product status + duplicate** — admin-only, no customer-facing change
2. **Volume pricing** — schema, checkout RPC, storefront, cart, admin
3. **CSV import** — admin-only, depends on (1)'s `status` column

## 1. Product status and duplicate

### Status column

Add `products.status text not null default 'active'` constrained to
`('draft', 'active', 'archived')`.

**`is_active` is kept, not replaced.** It becomes a DB-derived mirror of
`status`, maintained by a `BEFORE INSERT OR UPDATE` trigger:

```sql
new.is_active := (new.status = 'active');
```

Rationale: `is_active` is referenced by the partial index
`products_active_created_idx`, by the `products: public read` RLS policy, and
by the `product_images: public read` policy's `EXISTS` subquery. Converting it
to a `GENERATED ALWAYS AS` column requires DROP + ADD, which cascades those
policies away. The trigger keeps every existing index, policy, and storefront
query working untouched while making `status` the single writable source of
truth. This mirrors the codebase's existing precedent —
`enforce_order_status_transition` derives `verified_at` / `shipped_at` /
`cancelled_at` from `status` the same way.

**Client code stops writing `is_active` entirely.** It writes `status`.

**Backfill:** `is_active = false` → `'archived'`, not `'draft'`. Unticking
"Active" in the current UI means "stop selling this", which is archived's
meaning. Draft means "not finished being entered", which no existing row can
be.

### Admin UI

- Form: the "Active" checkbox becomes a three-option status `<select>`.
- List: a status filter. Default view hides `archived` (matching Shopify,
  where archived products are removed from the admin list view). Explicit
  filters for All / Draft / Active / Archived.
- Each list row and the edit form get a **Duplicate** button.

### Duplicate semantics

| Field | Behaviour | Why |
| --- | --- | --- |
| `name` | `"<name> (สำเนา)"` | distinguishable in the list |
| `slug` | `"<slug>-copy"`, `-copy-2`, … first free | `slug` is `unique not null` |
| `sku` | `null` | `sku` is `unique`; copying it would fail |
| `status` | `'draft'` | Shopify's behaviour; never publish an unedited copy |
| everything else | copied verbatim | that is the point of the feature |
| images | **not copied** | requires duplicating storage objects; out of scope, stated in the UI |

Slug selection uses a pure helper `nextAvailableSlug(base, taken)` fed by a
`slug ilike '<base>%'` query. A concurrent duplicate can still lose the race
and hit the unique constraint; that surfaces as a normal `getErrorMessage()`
error and the admin retries. Serialising this is not worth a lock.

## 2. Volume pricing

### Schema

```sql
create table public.product_price_tiers (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  min_quantity integer not null check (min_quantity >= 1),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  created_at   timestamptz not null default now(),
  unique (product_id, min_quantity)
);
```

A trigger `enforce_price_tier_rules` enforces the two rules that need a
cross-row or cross-table read, following Shopify's constraints:

- **at most 10 tiers per product** — Shopify's documented limit
- **`min_quantity > products.min_order_quantity`** — a tier at or below the
  MOQ is unreachable, because every order already starts at the MOQ

### Price resolution

The applicable tier is the one with the **highest `min_quantity` that is still
`<= quantity ordered`**. If no tier qualifies, `products.price` applies.

Precedence, highest first: `product_variants.price_override` → matching tier →
`products.price`. A variant override is an explicit per-variant price and must
not be silently undercut by a product-level tier.

### Server-side authority

`create_order()` resolves the tier itself, inside the existing `_cart`
temporary table, under the same `for no key update` product lock. Per
CLAUDE.md's standing rule — established by Variants and Promotions — the
client-side tier display is UX only and the mutating RPC never trusts it.

```sql
coalesce(
  v.price_override,
  (select t.unit_price
     from public.product_price_tiers t
    where t.product_id = p.id and t.min_quantity <= i.quantity
    order by t.min_quantity desc
    limit 1),
  p.price
)::numeric(12,2) as unit_price
```

### Client

- `src/lib/priceTiers.ts` — pure `resolveTierPrice(basePrice, tiers, quantity)`,
  unit tested. The single place this rule is expressed on the client.
- `ProductDetailPage` — a tier table, and a headline price that recomputes as
  the quantity input changes.
- `CartPage` — recomputes each line's price from the live tiers it already
  fetches via `useProduct`, and pushes the result into the cart store through
  a new `reconcilePricing` action. This keeps `useCartSubtotal()` and
  `CheckoutPage`'s displayed total correct without either file learning about
  tiers.
- `ProductListPage` is **not** changed. It shows the base price, as Shopify's
  collection pages do. Tier pricing is a detail-page concern.

Volume pricing is **core, not an optional module** — a wholesale kit that
cannot express a quantity break is not a wholesale kit. It therefore ships
without a feature flag, and its E2E spec runs unconditionally.

## 3. CSV import

Route `/admin/products/import`, reachable from a button on
`AdminProductListPage`.

### Parsing

No CSV dependency is added. `src/lib/csv.ts` implements an RFC 4180 reader
(quoted fields, doubled `""` escapes, embedded commas and newlines, CRLF) as a
pure function with unit tests. This is ~60 lines and avoids a runtime
dependency in a kit that is cloned per client.

### Columns

Required: `name`, `slug`, `price`.
Optional: `description`, `sku`, `category_slug`, `package_unit`,
`units_per_package`, `min_order_quantity`, `stock_quantity`,
`compare_at_price`, `track_inventory`, `sort_order`, `status`.

Unknown columns are ignored, not an error — supplier price lists carry extra
columns and rejecting the file over them would make the feature unusable.

### Matching and the status trap

Rows are matched to existing products **by `slug`**. `slug` is `not null
unique` and always present in a valid row; `sku` is nullable, so matching on it
would need a fallback path for no benefit.

A naive `upsert` would rewrite `status` on every existing row. For a monthly
supplier price-list refresh that would silently unpublish the entire live
catalogue. So the import splits the batch first:

- **slug not in the DB** → INSERT, `status` defaults to `'draft'`
- **slug already in the DB** → UPDATE, and `status` is **omitted from the
  update payload** unless the CSV supplied it explicitly

The same trap sits one column further out. A new product needs a value for
every field, so an INSERT uses the parser's defaults for any column the file
omitted — but pushing those same defaults into an UPDATE would reset
`min_order_quantity`, `units_per_package`, `stock_quantity` and `category_id`
on every existing product whenever someone imports a two-column price list. So
`parseProductRows` also reports which known columns the file actually
supplied, and **an UPDATE writes only those**.

A row whose `sku` collides with a *different* product's `sku` violates the
unique constraint. That is reported as a per-row failure rather than being
worked around — silently reassigning SKUs is worse than refusing.

### UI flow

Pick file → parse → preview table showing valid rows and per-row errors →
confirm → write in chunks of 100 → report inserted / updated / failed counts.
Nothing is written until the admin confirms the preview.

A "download template" button emits a blob-URL CSV with the header row and one
example line.

## Testing

- Pure helpers (`nextAvailableSlug`, `resolveTierPrice`, `parseCsv`,
  `parseProductRows`) get Vitest unit tests. The repo has no jsdom or React
  Testing Library, so component behaviour is covered by Playwright, not
  Vitest — every unit test targets a pure module.
- Each plan ships a Playwright spec that exercises its feature end to end
  against the local Supabase stack.
- The trigger rules and the `create_order()` tier resolution are verified
  through the E2E layer (an order placed at a tier quantity must record the
  tier price), not only by reading the migration.

## Out of scope

- `increment` quantity rules (own design pass)
- maximum order quantity
- `cost_per_item` / margin reporting
- SEO fields
- uploading images before the first save
- admin list search and bulk edit
- copying images on duplicate
