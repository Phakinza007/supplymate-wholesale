# Variants Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the Phase 2 "Variants" optional module — admin can add size/color-style variants
per product, customers must pick one before adding a variant-bearing product to cart, and the
selection flows through cart/checkout/order display — without changing behavior for any product
when the `variants` flag is off.

**Architecture:** Almost no database work (schema/RLS/RPC already fully support variants from
Step 1). A shared pair of data hooks, two lazy-loaded module components (an admin `VariantsPanel`
and a customer-facing `VariantSelector`), and small, mostly `<Feature>`-gated additions to five core
files. The customer selector is a *controlled child*: it reports upward via two stable `useState`
setter props (`onVariantsLoaded`, `onSelect`) rather than core ever querying variant data itself.

**Tech Stack:** Same as the rest of the project — Supabase (Postgres/RLS), React 19,
`@tanstack/react-query`, shadcn/ui primitives (`Button`, `Input`, `Label`).

## Global Constraints

- **No new migration.** `public.product_variants` (from `20250101000300_catalog.sql`) already has
  the post-`20250101000700_advisor_fixes.sql` split-policy RLS shape — verbatim, currently live:
  ```sql
  create policy "product_variants: read" on public.product_variants for select to anon, authenticated
    using (
      public.is_admin()
      or (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active))
    );
  create policy "product_variants: admin insert" on public.product_variants for insert to authenticated
    with check (public.is_admin());
  create policy "product_variants: admin update" on public.product_variants for update to authenticated
    using (public.is_admin()) with check (public.is_admin());
  create policy "product_variants: admin delete" on public.product_variants for delete to authenticated
    using (public.is_admin());
  ```
  This means: **one query hook serves both the admin panel and the customer selector** — RLS alone
  correctly returns all variants (active + inactive) to an admin session and only active variants
  (of an active product) to everyone else, exactly like `useProductReviews` served both surfaces in
  the Reviews module. Admin writes go through direct `.insert()`/`.update()` calls (no RPC needed —
  admin already has real RLS write policies here, mirroring `useAdminProductMutations.ts`'s own
  direct-table-write pattern), never a hard delete (`is_active` toggle only, via the same `update`).
- **`create_order()` and `cartStore.ts` already fully support variants** — verified by reading both
  in full. `create_order()`'s pricing query already `left join`s `product_variants` and uses
  `coalesce(v.price_override, p.price)`. `cartStore.ts`'s `addItem`/`removeItem`/`updateQuantity`/
  `sameLine` are all already generic over `variantId: string | null` with zero hardcoded nulls — the
  *only* hardcoding is at the `ProductDetailPage.tsx` call site (Task 3 fixes this). Do not modify
  `create_order()` or the mutation logic inside `cartStore.ts` — only `CartItem`'s shape needs one
  new field (Task 3).
- **`sku` on `product_variants` is `unique`, exactly like `products.sku`.** Per CLAUDE.md's existing
  rule for this class of bug: **default `sku` to `null`, never `''`**, in every form field and every
  mutation call — a blank-SKU variant form defaulting to `''` breaks on the second variant and
  silently rewrites existing `null` SKUs to `''` on edit. Mirror `AdminProductForm.tsx`'s exact
  pattern: `sku: initial?.sku ?? null` on load, `e.target.value || null` on change.
- **Variant-name display in cart/checkout/order pages needs NO `<Feature>` gating.** Unlike the
  *selection* UI (which must be gated, since it queries `product_variants` and must never run with
  the flag off), a `CartItem.variantName` / `order_items.variant_name` field is simply always `null`
  when the flag is off (nothing can ever set it), so a bare `{item.variantName && ...}` conditional
  is inert in that case — the same reasoning CLAUDE.md already applies to other always-present-but-
  often-null snapshot fields. Do not wrap these five small display edits in `<Feature>`.
- **Passing `useState` setters directly as callback props is intentional, not an oversight.**
  `VariantSelector`'s `onVariantsLoaded`/`onSelect` props are wired directly to `ProductDetailPage`'s
  `setHasVariants`/`setSelectedVariant` — React guarantees `useState` setter identity is stable
  across renders, so `VariantSelector`'s internal `useEffect([variants, onVariantsLoaded])` never
  re-fires spuriously and needs no extra memoization or lint suppression.
- **`src/core` must never import from `src/modules/optional`** — mechanically enforced by
  `scripts/check-core-boundary.mjs` (matches only static `from '...'` imports). Every core-file
  change below uses `React.lazy(() => import('@/modules/optional/variants/...'))`, the same
  sanctioned dynamic-import pattern used throughout the Reviews module.
- **The `variants` feature flag stays `false` in the committed `branding.config.ts`** — same
  per-client-decision convention as `reviews`.
- **Lesson carried over from the Reviews module's final review:** ship the E2E spec as a
  **permanent**, flag-guarded file from the start (`test.skip(!brandConfig.features.variants, ...)`,
  same pattern as `e2e/reviews.spec.ts`) rather than a throwaway-then-deleted spec — the Reviews
  final review found that deleting the verification spec left that module with zero regression
  coverage and recommended this exact pattern as the fix.

---

### Task 1: Data hooks

**Files:**
- Create: `src/modules/optional/variants/useProductVariants.ts`
- Create: `src/modules/optional/variants/useVariantMutations.ts`

**Interfaces:**
- Produces (consumed by Tasks 2 and 3):
  - `useProductVariants(productId: string)` — TanStack Query hook; `data` is
    `Database['public']['Tables']['product_variants']['Row'][]`, ordered by `sort_order`.
  - `useVariantMutations(productId: string)` — returns `{ createVariant, updateVariant }`.
    `createVariant.mutate(input: Omit<VariantInsert, 'product_id'>)`.
    `updateVariant.mutate({ id: string, ...input: VariantUpdate })`.

- [ ] **Step 1: Write `useProductVariants.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductVariants(productId: string) {
  return useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!productId,
  })
}
```

- [ ] **Step 2: Write `useVariantMutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type VariantInsert = Database['public']['Tables']['product_variants']['Insert']
type VariantUpdate = Database['public']['Tables']['product_variants']['Update']

export function useVariantMutations(productId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })

  const createVariant = useMutation({
    mutationFn: async (input: Omit<VariantInsert, 'product_id'>) => {
      const { error } = await supabase
        .from('product_variants')
        .insert({ ...input, product_id: productId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateVariant = useMutation({
    mutationFn: async ({ id, ...input }: VariantUpdate & { id: string }) => {
      const { error } = await supabase.from('product_variants').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createVariant, updateVariant }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes (these files aren't imported anywhere yet).

- [ ] **Step 4: Commit**

```bash
git add src/modules/optional/variants/useProductVariants.ts \
  src/modules/optional/variants/useVariantMutations.ts
git commit -m "feat(variants): add data hooks for variants module"
```

---

### Task 2: Admin variant management (`VariantsPanel`) + wiring

**Files:**
- Create: `src/modules/optional/variants/VariantsPanel.tsx`
- Modify: `src/core/admin/AdminProductListPage.tsx`

**Interfaces:**
- Consumes: Task 1's `useProductVariants`, `useVariantMutations`.
- Produces (consumed by Task 5's E2E spec): default export `VariantsPanel({ productId }: {
  productId: string })`, rendering an "Add variant" button, a list of existing variants each with an
  "Edit" button, and an inline form (fields `#variant-name`, `#variant-sku`, `#variant-price`,
  `#variant-stock`, an "Active" checkbox, and a "Save variant" submit button) shown in place of the
  list while adding/editing.

- [ ] **Step 1: Write `VariantsPanel.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { useProductVariants } from '@/modules/optional/variants/useProductVariants'
import { useVariantMutations } from '@/modules/optional/variants/useVariantMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPrice } from '@/lib/formatPrice'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

interface VariantFormInput {
  name: string
  sku: string | null
  price_override: number | null
  stock_quantity: number
  is_active: boolean
}

function emptyForm(initial?: Variant): VariantFormInput {
  return {
    name: initial?.name ?? '',
    sku: initial?.sku ?? null,
    price_override: initial?.price_override ?? null,
    stock_quantity: initial?.stock_quantity ?? 0,
    is_active: initial?.is_active ?? true,
  }
}

export default function VariantsPanel({ productId }: { productId: string }) {
  const { data: variants, isLoading, isError } = useProductVariants(productId)
  const { createVariant, updateVariant } = useVariantMutations(productId)
  const [editing, setEditing] = useState<Variant | 'new' | null>(null)
  const [form, setForm] = useState<VariantFormInput>(emptyForm())
  const [error, setError] = useState<string | null>(null)

  function startEdit(variant: Variant | 'new') {
    setError(null)
    setForm(emptyForm(variant === 'new' ? undefined : variant))
    setEditing(variant)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing === 'new') {
        await createVariant.mutateAsync(form)
      } else if (editing) {
        await updateVariant.mutateAsync({ id: editing.id, ...form })
      }
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save variant.'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Variants</h2>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => startEdit('new')}>
            Add variant
          </Button>
        )}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load variants.</p>}

      {!editing && (
        <ul className="flex flex-col gap-2">
          {variants?.length === 0 && (
            <p className="text-sm text-muted-foreground">No variants yet.</p>
          )}
          {variants?.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {v.name}
                  {!v.is_active && (
                    <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {v.price_override != null ? formatPrice(v.price_override) : 'Base price'} ·
                  Stock: {v.stock_quantity}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => startEdit(v)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant-name">Name</Label>
            <Input
              id="variant-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Black / M"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-sku">SKU</Label>
              <Input
                id="variant-sku"
                value={form.sku ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value || null }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-price">Price override (THB)</Label>
              <Input
                id="variant-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price_override ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    price_override: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant-stock">Stock quantity</Label>
            <Input
              id="variant-stock"
              type="number"
              min={0}
              value={form.stock_quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={createVariant.isPending || updateVariant.isPending}>
              {createVariant.isPending || updateVariant.isPending ? 'Saving…' : 'Save variant'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `AdminProductListPage.tsx`**

The current file imports:

```tsx
import { useState } from 'react'
import { useAdminProducts } from '@/core/admin/useAdminProducts'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminProductMutations } from '@/core/admin/useAdminProductMutations'
import { AdminProductForm } from '@/core/admin/AdminProductForm'
import { ProductImagesPanel } from '@/core/admin/ProductImagesPanel'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'
```

Change to add two imports:

```tsx
import { lazy, Suspense, useState } from 'react'
import { useAdminProducts } from '@/core/admin/useAdminProducts'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminProductMutations } from '@/core/admin/useAdminProductMutations'
import { AdminProductForm } from '@/core/admin/AdminProductForm'
import { ProductImagesPanel } from '@/core/admin/ProductImagesPanel'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Feature } from '@/lib/Feature'
import type { Database } from '@/lib/database.types'

const VariantsPanel = lazy(() => import('@/modules/optional/variants/VariantsPanel'))
```

Then change the line `{editing !== 'new' && <ProductImagesPanel productId={editing.id} />}` to:

```tsx
        {editing !== 'new' && <ProductImagesPanel productId={editing.id} />}
        {editing !== 'new' && (
          <Feature flag="variants">
            <Suspense fallback={null}>
              <VariantsPanel productId={editing.id} />
            </Suspense>
          </Feature>
        )}
```

- [ ] **Step 3: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass, `core/optional boundary OK` still printed.

- [ ] **Step 4: Commit**

```bash
git add src/modules/optional/variants/VariantsPanel.tsx src/core/admin/AdminProductListPage.tsx
git commit -m "feat(variants): add admin VariantsPanel and wire into product editor"
```

---

### Task 3: Customer variant selection (`VariantSelector`) + `ProductDetailPage`/`cartStore` wiring

**Files:**
- Create: `src/modules/optional/variants/VariantSelector.tsx`
- Modify: `src/core/cart/cartStore.ts`
- Modify: `src/core/catalog/ProductDetailPage.tsx`

**Interfaces:**
- Consumes: Task 1's `useProductVariants`.
- Produces: default export `VariantSelector({ productId, selectedVariantId, onVariantsLoaded,
  onSelect }: { productId: string; selectedVariantId: string | null; onVariantsLoaded: (hasVariants:
  boolean) => void; onSelect: (variant: Database['public']['Tables']['product_variants']['Row'] |
  null) => void })` — renders nothing (`null`) while loading or if the product has zero active
  variants; otherwise a row of buttons, one per active variant, disabled when that variant's
  `stock_quantity <= 0`, calling `onSelect(variant)` on click.

- [ ] **Step 1: Write `VariantSelector.tsx`**

```tsx
import { useEffect } from 'react'
import { useProductVariants } from '@/modules/optional/variants/useProductVariants'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

export default function VariantSelector({
  productId,
  selectedVariantId,
  onVariantsLoaded,
  onSelect,
}: {
  productId: string
  selectedVariantId: string | null
  onVariantsLoaded: (hasVariants: boolean) => void
  onSelect: (variant: Variant | null) => void
}) {
  const { data: variants, isLoading } = useProductVariants(productId)
  const activeVariants = (variants ?? []).filter((v) => v.is_active)

  useEffect(() => {
    if (variants) {
      onVariantsLoaded(activeVariants.length > 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onVariantsLoaded is a stable
    // useState setter (see the plan's Global Constraints); activeVariants is derived from
    // `variants`, which is already the effect's real dependency.
  }, [variants, onVariantsLoaded])

  if (isLoading || activeVariants.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Options</span>
      <div className="flex flex-wrap gap-2">
        {activeVariants.map((v) => {
          const outOfStock = v.stock_quantity <= 0
          const selected = v.id === selectedVariantId
          return (
            <button
              key={v.id}
              type="button"
              disabled={outOfStock}
              onClick={() => onSelect(v)}
              className={
                'rounded-md border px-3 py-1.5 text-sm ' +
                (selected ? 'border-foreground' : 'border-input') +
                (outOfStock ? ' cursor-not-allowed opacity-50 line-through' : '')
              }
            >
              {v.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

The `eslint-disable` comment is inert under this project's linter (oxlint, not eslint) — it's
present purely as documentation for a future contributor who might otherwise "fix" a perceived
missing dependency; do not remove it, but do not expect it to suppress anything either.

- [ ] **Step 2: Add `variantName` to `cartStore.ts`'s `CartItem`**

Change:

```ts
export interface CartItem {
  productId: string
  variantId: string | null
  productName: string
  productSlug: string
  unitPrice: number
  imagePath: string | null
  quantity: number
}
```

to:

```ts
export interface CartItem {
  productId: string
  variantId: string | null
  productName: string
  productSlug: string
  variantName: string | null
  unitPrice: number
  imagePath: string | null
  quantity: number
}
```

No other changes to this file — every function (`addItem`, `removeItem`, `updateQuantity`,
`sameLine`) already operates generically over the full `CartItem`/`CartLine` shape.

- [ ] **Step 3: Wire `ProductDetailPage.tsx`**

The current file imports:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { useCartStore } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
```

Change to:

```tsx
import { lazy, Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { useCartStore } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Feature } from '@/lib/Feature'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

const VariantSelector = lazy(() => import('@/modules/optional/variants/VariantSelector'))
```

Inside the component, change:

```tsx
  const { data: product, isLoading, isError } = useProduct(slug)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const addItem = useCartStore((state) => state.addItem)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError || !product) return <p className="p-8 text-destructive">Product not found.</p>

  const images = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)
  const activeImage = images[activeImageIndex]
  const outOfStock = product.track_inventory && product.stock_quantity <= 0
  const maxQuantity = product.track_inventory ? Math.max(product.stock_quantity, 1) : 99
```

to:

```tsx
  const { data: product, isLoading, isError } = useProduct(slug)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const addItem = useCartStore((state) => state.addItem)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError || !product) return <p className="p-8 text-destructive">Product not found.</p>

  const images = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)
  const activeImage = images[activeImageIndex]
  const needsSelection = hasVariants && !selectedVariant
  const outOfStock = hasVariants
    ? !!selectedVariant && selectedVariant.stock_quantity <= 0
    : product.track_inventory && product.stock_quantity <= 0
  const addToCartDisabled = outOfStock || needsSelection
  const maxQuantity = hasVariants
    ? Math.max(selectedVariant?.stock_quantity ?? 1, 1)
    : product.track_inventory
      ? Math.max(product.stock_quantity, 1)
      : 99
```

Then change the price display block:

```tsx
          <div className="flex items-center gap-2">
            <span className="text-xl">{formatPrice(Number(product.price))}</span>
            {product.compare_at_price && (
              <span className="text-muted-foreground line-through">
                {formatPrice(Number(product.compare_at_price))}
              </span>
            )}
          </div>
```

to:

```tsx
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {formatPrice(selectedVariant?.price_override ?? Number(product.price))}
            </span>
            {product.compare_at_price && (
              <span className="text-muted-foreground line-through">
                {formatPrice(Number(product.compare_at_price))}
              </span>
            )}
          </div>
          <Feature flag="variants">
            <Suspense fallback={null}>
              <VariantSelector
                productId={product.id}
                selectedVariantId={selectedVariant?.id ?? null}
                onVariantsLoaded={setHasVariants}
                onSelect={setSelectedVariant}
              />
            </Suspense>
          </Feature>
```

Then change the add-to-cart block:

```tsx
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.min(maxQuantity, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-20"
              disabled={outOfStock}
            />
            <Button
              disabled={outOfStock}
              onClick={() => {
                addItem(
                  {
                    productId: product.id,
                    variantId: null,
                    productName: product.name,
                    productSlug: product.slug,
                    unitPrice: Number(product.price),
                    imagePath: images[0]?.storage_path ?? null,
                  },
                  quantity,
                )
                setJustAdded(true)
                setTimeout(() => setJustAdded(false), 2000)
              }}
            >
              {outOfStock ? 'Out of stock' : 'Add to cart'}
            </Button>
            {justAdded && <span className="text-sm text-muted-foreground">Added ✓</span>}
          </div>
```

to:

```tsx
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.min(maxQuantity, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-20"
              disabled={addToCartDisabled}
            />
            <Button
              disabled={addToCartDisabled}
              onClick={() => {
                addItem(
                  {
                    productId: product.id,
                    variantId: selectedVariant?.id ?? null,
                    productName: product.name,
                    productSlug: product.slug,
                    variantName: selectedVariant?.name ?? null,
                    unitPrice: selectedVariant?.price_override ?? Number(product.price),
                    imagePath: images[0]?.storage_path ?? null,
                  },
                  quantity,
                )
                setJustAdded(true)
                setTimeout(() => setJustAdded(false), 2000)
              }}
            >
              {needsSelection ? 'Select an option' : outOfStock ? 'Out of stock' : 'Add to cart'}
            </Button>
            {justAdded && <span className="text-sm text-muted-foreground">Added ✓</span>}
          </div>
```

- [ ] **Step 4: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass. This is also the step that would surface a missing `variantName` field anywhere
`addItem` is called with an object literal (TypeScript's excess-property/missing-property checking
on the `Omit<CartItem, 'quantity'>` parameter) — `ProductDetailPage.tsx` is the only call site in
the codebase (confirm with `grep -rn "addItem(" src/` if in doubt).

- [ ] **Step 5: Commit**

```bash
git add src/modules/optional/variants/VariantSelector.tsx src/core/cart/cartStore.ts \
  src/core/catalog/ProductDetailPage.tsx
git commit -m "feat(variants): add customer VariantSelector and wire into product page + cart"
```

---

### Task 4: Variant-name display in cart, checkout, and order pages

**Files:**
- Modify: `src/core/cart/CartPage.tsx`
- Modify: `src/core/checkout/CheckoutPage.tsx`
- Modify: `src/core/orders/OrderDetailPage.tsx`
- Modify: `src/core/admin/AdminOrderDetailPage.tsx`

**Interfaces:**
- Consumes: Task 3's `CartItem.variantName`; the pre-existing `order_items.variant_name` column
  (already present in `database.types.ts`, no change needed there).

- [ ] **Step 1: `CartPage.tsx`**

In the `CartLineItem` component, change:

```tsx
        <Link to={`/products/${item.productSlug}`} className="font-medium hover:underline">
          {item.productName}
        </Link>
        <span className="text-sm text-muted-foreground">{formatPrice(item.unitPrice)} each</span>
```

to:

```tsx
        <Link to={`/products/${item.productSlug}`} className="font-medium hover:underline">
          {item.productName}
        </Link>
        {item.variantName && (
          <span className="text-sm text-muted-foreground">{item.variantName}</span>
        )}
        <span className="text-sm text-muted-foreground">{formatPrice(item.unitPrice)} each</span>
```

- [ ] **Step 2: `CheckoutPage.tsx`**

Change:

```tsx
            <span>
              {item.productName} × {item.quantity}
            </span>
```

to:

```tsx
            <span>
              {item.productName}
              {item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}
            </span>
```

- [ ] **Step 3: `OrderDetailPage.tsx`**

Change:

```tsx
            <span>
              {item.product_name} × {item.quantity}
              {order.status === 'done' && item.product_slug && (
```

to:

```tsx
            <span>
              {item.product_name}
              {item.variant_name ? ` (${item.variant_name})` : ''} × {item.quantity}
              {order.status === 'done' && item.product_slug && (
```

(Only the first line changes — the `Feature flag="reviews"` block that follows, added by the
Reviews module, is untouched.)

- [ ] **Step 4: `AdminOrderDetailPage.tsx`**

Change:

```tsx
              {item.product_name} × {item.quantity}
```

to:

```tsx
              {item.product_name}
              {item.variant_name ? ` (${item.variant_name})` : ''} × {item.quantity}
```

- [ ] **Step 5: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/cart/CartPage.tsx src/core/checkout/CheckoutPage.tsx \
  src/core/orders/OrderDetailPage.tsx src/core/admin/AdminOrderDetailPage.tsx
git commit -m "feat(variants): show variant name in cart, checkout, and order pages"
```

---

### Task 5: Verification (flag on locally to prove it, permanent flag-guarded E2E spec)

**Files:**
- Create: `e2e/variants.spec.ts` (permanent — not deleted after this task, unlike the Reviews
  module's Task 5 throwaway spec)

**Interfaces:**
- Consumes: `e2e/helpers/auth.ts`'s `signUp`, `logIn`, `uniqueEmail`; `e2e/helpers/checkout.ts`'s
  `addAddress`; `brandConfig` from `src/config/branding.config.ts` (imported directly by the spec
  for the `test.skip` guard, same pattern as `e2e/reviews.spec.ts`).

- [ ] **Step 1: Temporarily enable the flag for local verification**

Edit `src/config/branding.config.ts`, changing `variants: false` to `variants: true`. **Do not
commit this change** — it's reverted in Step 4.

- [ ] **Step 2: Write `e2e/variants.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress } from './helpers/checkout'

test.skip(!brandConfig.features.variants, 'variants feature flag is off')

test('variants module: admin creates variants, customer must select one, cart/checkout/order show variant name', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/products')
  await adminPage.getByRole('button', { name: 'Edit' }).first().click()
  const productSlug = await adminPage.locator('#slug').inputValue()

  await adminPage.getByRole('button', { name: 'Add variant' }).click()
  await adminPage.locator('#variant-name').fill('Small')
  await adminPage.locator('#variant-stock').fill('5')
  await adminPage.getByRole('button', { name: 'Save variant' }).click()
  await expect(adminPage.getByText('Small', { exact: true })).toBeVisible()

  await adminPage.getByRole('button', { name: 'Add variant' }).click()
  await adminPage.locator('#variant-name').fill('Large (out of stock)')
  await adminPage.locator('#variant-stock').fill('0')
  await adminPage.getByRole('button', { name: 'Save variant' }).click()
  await expect(adminPage.getByText('Large (out of stock)', { exact: true })).toBeVisible()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Variant Customer',
    email: uniqueEmail('variant-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Variant Customer',
    phone: '0891234567',
    line1: '1 Variant Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await customerPage.goto(`/products/${productSlug}`)
  await expect(customerPage.getByRole('button', { name: 'Select an option' })).toBeDisabled()
  await expect(
    customerPage.getByRole('button', { name: 'Large (out of stock)' }),
  ).toBeDisabled()

  await customerPage.getByRole('button', { name: 'Small', exact: true }).click()
  await customerPage.getByRole('button', { name: 'Add to cart' }).click()
  await expect(customerPage.getByText('Added ✓')).toBeVisible()

  await customerPage.goto('/cart')
  await expect(customerPage.getByText('Small')).toBeVisible()

  await customerPage.getByRole('link', { name: 'Proceed to checkout' }).click()
  await expect(customerPage.getByText(/\(Small\)/)).toBeVisible()
  await customerPage.getByRole('button', { name: 'Place order' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)
  await expect(customerPage.getByText(/\(Small\)/)).toBeVisible()

  await adminContext.close()
  await customerContext.close()
})
```

- [ ] **Step 3: Run it against a freshly-reset local stack**

```bash
supabase db reset
npm run test:e2e -- variants.spec.ts
```

Expected: `1 passed`. The first product in `/admin/products`' list order depends on
`useAdminProducts`' actual ordering — if `#slug`'s value comes back empty or the test can't find an
"Edit" button, check that hook's query for its `order(...)` clause and adjust expectations
accordingly; the test doesn't care *which* product it is, only that exactly one exists to attach
variants to (every seeded product qualifies).

- [ ] **Step 4: Revert the flag and confirm bundle exclusion**

```bash
git checkout -- src/config/branding.config.ts
npm run build
grep -r "Select an option" dist/assets/*.js
```

Expected: the `grep` finds nothing in the main chunk (only inside a separate lazy chunk, if
present at all — Vite may not even emit `VariantSelector` as visibly labeled since it's small;
what matters is the string is absent from `dist/assets/index-*.js`, the main chunk). Also confirm
`grep -r "Add variant" dist/assets/index-*.js` (the `VariantsPanel`-only string) finds nothing in
the main chunk.

- [ ] **Step 5: Full regression check**

```bash
npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

Expected: all pass. `npm run test:e2e`'s reporter should show the existing golden-path + security +
reviews specs passing/skipped as before, plus `variants.spec.ts` now showing as **skipped** (not
run, not failed) with the committed `variants: false` default.

- [ ] **Step 6: Commit**

```bash
git add e2e/variants.spec.ts
git commit -m "test(variants): add flag-guarded E2E spec for variants module"
```
