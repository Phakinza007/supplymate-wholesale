# Product Status and Duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give products a Draft / Active / Archived lifecycle and a one-click Duplicate action in the admin.

**Architecture:** A new `products.status` text column becomes the single writable source of truth. The existing `is_active` boolean is kept and maintained by a `BEFORE INSERT OR UPDATE` trigger as `status = 'active'`, so every existing index, RLS policy, and storefront query keeps working untouched. The admin form's Active checkbox becomes a status select; the admin list gains a status filter and a per-row Duplicate button backed by a pure slug-collision helper.

**Tech Stack:** Postgres (Supabase migrations), React 19 + TypeScript, TanStack Query, Vitest (pure modules only), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-product-management-design.md`

## Global Constraints

- All money renders through `formatPrice()` (`src/lib/formatPrice.ts`); never `toLocaleString()` directly.
- All mutation errors render through `getErrorMessage(err, fallback)` (`src/lib/getErrorMessage.ts`); never a bare `instanceof Error` check.
- Every admin list page handles `isError` distinctly from `isLoading`, rendering `<p className="p-8 text-destructive">Failed to load X.</p>`.
- Products are never deleted from the admin UI. There is no delete button anywhere in `src/core/admin/`.
- `sku` defaults to `null`, never `''` — `products.sku` is `unique` and Postgres permits many NULLs but only one empty string.
- Client code must never write `products.is_active` after this plan. It writes `status`.
- `src/lib/database.types.ts` must retain its `__InternalSupabase: { PostgrestVersion: "14.15" }` block; `npm run lint` fails without it.
- Migration filenames are applied in filename order; this plan adds exactly one, `20260831000100_product_status.sql`.
- Vitest has no jsdom or React Testing Library. Unit tests target pure modules only; component behaviour is covered by Playwright.

---

### Task 1: Status column and derived-`is_active` trigger

**Files:**
- Create: `supabase/migrations/20260831000100_product_status.sql`
- Modify: `src/lib/database.types.ts` (products `Row`, `Insert`, `Update`)

**Interfaces:**
- Consumes: nothing.
- Produces: `public.products.status text not null default 'active'` constrained to `('draft','active','archived')`; trigger `trg_products_sync_is_active`; index `products_status_idx`. TypeScript sees `status: string` on `Row` and `status?: string` on `Insert`/`Update`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260831000100_product_status.sql`:

```sql
-- Product lifecycle: draft (still being entered) -> active (on sale) ->
-- archived (withdrawn from sale, order history kept).
--
-- `is_active` is deliberately KEPT rather than replaced. The partial index
-- products_active_created_idx, the "products: public read" policy and the
-- "product_images: public read" policy's EXISTS subquery all read it, and
-- converting it to a GENERATED column needs DROP ... CASCADE, which would
-- take those policies with it. A BEFORE trigger derives it instead, so
-- `status` is the only writable source of truth and every existing read
-- path keeps working. Same shape as enforce_order_status_transition
-- deriving verified_at/shipped_at/cancelled_at from orders.status.
alter table public.products
  add column status text not null default 'active'
    check (status in ('draft', 'active', 'archived'));

-- Backfill BEFORE the trigger exists, so this UPDATE is not rewritten by it.
-- An existing is_active = false row meant "withdrawn from sale", which is
-- archived. Draft means "not finished being entered", which no existing row
-- can be.
update public.products set status = 'archived' where not is_active;

create or replace function public.sync_product_is_active()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;

create trigger trg_products_sync_is_active
  before insert or update on public.products
  for each row execute function public.sync_product_is_active();

create index products_status_sort_idx on public.products (status, sort_order);
```

- [ ] **Step 2: Apply the migration and verify the trigger**

Run:

```bash
supabase db reset --yes
```

Then verify the derivation actually happens, rather than trusting the migration text:

```bash
supabase db reset --yes && psql "$(supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')" -c "insert into public.products (slug, name, price, status) values ('trigger-probe','Trigger Probe',10,'draft') returning slug, status, is_active;" -c "update public.products set status='active' where slug='trigger-probe' returning slug, status, is_active;" -c "delete from public.products where slug='trigger-probe';"
```

Expected: the INSERT returns `draft | f` and the UPDATE returns `active | t`.

If `supabase status -o json` is unavailable in this environment, run the same three statements through the Supabase Studio SQL editor at the URL printed by `supabase status`.

- [ ] **Step 3: Add `status` to the generated database types**

Hand-edit `src/lib/database.types.ts` rather than running `supabase gen types` — CLAUDE.md records that the installed CLI drops the `__InternalSupabase` block unpredictably, and this is a three-line addition.

In the `products` block, add one line to each of `Row`, `Insert`, and `Update`, keeping each object's alphabetical ordering (`sort_order` … `status` … `stock_quantity`):

```ts
// products.Row — insert between `sort_order: number` and `stock_quantity: number`
          status: string
```

```ts
// products.Insert — insert between `sort_order?: number` and `stock_quantity?: number`
          status?: string
```

```ts
// products.Update — insert between `sort_order?: number` and `stock_quantity?: number`
          status?: string
```

- [ ] **Step 4: Verify typecheck and lint still pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS, including the `database.types.ts __InternalSupabase check OK` line.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260831000100_product_status.sql src/lib/database.types.ts
git commit -m "feat: add products.status lifecycle column with derived is_active"
```

---

### Task 2: Status labels and duplicate helpers (pure modules)

**Files:**
- Create: `src/lib/productStatus.ts`
- Create: `src/lib/productStatus.test.ts`
- Create: `src/core/admin/duplicateProduct.ts`
- Create: `src/core/admin/duplicateProduct.test.ts`

**Interfaces:**
- Consumes: `products.status` from Task 1; `Database` from `src/lib/database.types.ts`.
- Produces:
  - `type ProductStatus = 'draft' | 'active' | 'archived'`
  - `const PRODUCT_STATUSES: readonly ProductStatus[]`
  - `productStatusLabel(status: string): string`
  - `type ProductInput = Omit<Database['public']['Tables']['products']['Insert'], 'id' | 'created_at' | 'updated_at' | 'is_active'>`
  - `nextAvailableSlug(base: string, taken: string[]): string`
  - `buildDuplicateInput(product: Product, slug: string): ProductInput`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/productStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PRODUCT_STATUSES, productStatusLabel } from './productStatus'

describe('productStatusLabel', () => {
  it('labels every known status in Thai', () => {
    expect(productStatusLabel('draft')).toBe('แบบร่าง')
    expect(productStatusLabel('active')).toBe('เปิดขาย')
    expect(productStatusLabel('archived')).toBe('เลิกขาย')
  })

  it('falls back to the raw value for an unknown status', () => {
    expect(productStatusLabel('something-else')).toBe('something-else')
  })

  it('exposes the three statuses in lifecycle order', () => {
    expect(PRODUCT_STATUSES).toEqual(['draft', 'active', 'archived'])
  })
})
```

Create `src/core/admin/duplicateProduct.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDuplicateInput, nextAvailableSlug } from './duplicateProduct'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']

const product: Product = {
  category_id: 'cat-1',
  compare_at_price: 1490,
  created_at: '2026-08-01T00:00:00Z',
  description: 'แก้วพลาสติกใส',
  has_variants: false,
  id: 'prod-1',
  is_active: true,
  metadata: {},
  min_order_quantity: 3,
  name: 'แก้วพลาสติกใส 16 ออนซ์',
  package_unit: 'carton',
  price: 1290,
  sku: 'CUP-16',
  slug: 'clear-cup-16oz',
  sort_order: 5,
  status: 'active',
  stock_quantity: 40,
  track_inventory: true,
  units_per_package: 50,
  updated_at: '2026-08-01T00:00:00Z',
}

describe('nextAvailableSlug', () => {
  it('uses -copy when nothing is taken', () => {
    expect(nextAvailableSlug('clear-cup-16oz', [])).toBe('clear-cup-16oz-copy')
  })

  it('ignores the original slug itself', () => {
    expect(nextAvailableSlug('clear-cup-16oz', ['clear-cup-16oz'])).toBe('clear-cup-16oz-copy')
  })

  it('numbers from 2 once -copy is taken', () => {
    expect(nextAvailableSlug('a', ['a', 'a-copy'])).toBe('a-copy-2')
    expect(nextAvailableSlug('a', ['a', 'a-copy', 'a-copy-2'])).toBe('a-copy-3')
  })

  it('fills the first gap rather than always appending', () => {
    expect(nextAvailableSlug('a', ['a-copy', 'a-copy-3'])).toBe('a-copy-2')
  })
})

describe('buildDuplicateInput', () => {
  const input = buildDuplicateInput(product, 'clear-cup-16oz-copy')

  it('marks the copy in its name', () => {
    expect(input.name).toBe('แก้วพลาสติกใส 16 ออนซ์ (สำเนา)')
  })

  it('lands as a draft so an unedited copy never reaches the storefront', () => {
    expect(input.status).toBe('draft')
  })

  it('clears the SKU because products.sku is unique', () => {
    expect(input.sku).toBeNull()
  })

  it('takes the caller-resolved slug', () => {
    expect(input.slug).toBe('clear-cup-16oz-copy')
  })

  it('copies pricing and wholesale fields verbatim', () => {
    expect(input.price).toBe(1290)
    expect(input.compare_at_price).toBe(1490)
    expect(input.package_unit).toBe('carton')
    expect(input.units_per_package).toBe(50)
    expect(input.min_order_quantity).toBe(3)
    expect(input.category_id).toBe('cat-1')
    expect(input.stock_quantity).toBe(40)
    expect(input.track_inventory).toBe(true)
    expect(input.sort_order).toBe(5)
    expect(input.description).toBe('แก้วพลาสติกใส')
  })

  it('never carries is_active, which the database derives', () => {
    expect('is_active' in input).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./productStatus"` and `"./duplicateProduct"`.

- [ ] **Step 3: Write the implementations**

Create `src/lib/productStatus.ts`:

```ts
export type ProductStatus = 'draft' | 'active' | 'archived'

// Lifecycle order: still being entered -> on sale -> withdrawn.
export const PRODUCT_STATUSES: readonly ProductStatus[] = ['draft', 'active', 'archived']

const THAI_LABEL: Record<ProductStatus, string> = {
  draft: 'แบบร่าง',
  active: 'เปิดขาย',
  archived: 'เลิกขาย',
}

export function productStatusLabel(status: string): string {
  return THAI_LABEL[status as ProductStatus] ?? status
}
```

Create `src/core/admin/duplicateProduct.ts`:

```ts
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']

// `is_active` is omitted deliberately: the DB derives it from `status` via
// trg_products_sync_is_active, so sending it would be a write the trigger
// immediately discards.
export type ProductInput = Omit<
  Database['public']['Tables']['products']['Insert'],
  'id' | 'created_at' | 'updated_at' | 'is_active'
>

// products.slug is `not null unique`, so a duplicate needs a slug nobody
// holds. Bounded by `taken.length + 2`, which always contains a free slot
// because at most `taken.length` of the candidates can be occupied.
export function nextAvailableSlug(base: string, taken: string[]): string {
  const used = new Set(taken)
  const first = `${base}-copy`
  if (!used.has(first)) return first

  for (let n = 2; n <= used.size + 2; n += 1) {
    const candidate = `${base}-copy-${n}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error(`could not find a free slug for "${base}"`)
}

// Images are not copied — that would mean duplicating storage objects, which
// is out of scope. The admin re-uploads them on the copy.
export function buildDuplicateInput(product: Product, slug: string): ProductInput {
  return {
    name: `${product.name} (สำเนา)`,
    slug,
    description: product.description,
    price: product.price,
    compare_at_price: product.compare_at_price,
    sku: null,
    stock_quantity: product.stock_quantity,
    track_inventory: product.track_inventory,
    category_id: product.category_id,
    sort_order: product.sort_order,
    status: 'draft',
    package_unit: product.package_unit,
    units_per_package: product.units_per_package,
    min_order_quantity: product.min_order_quantity,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/productStatus.ts src/lib/productStatus.test.ts src/core/admin/duplicateProduct.ts src/core/admin/duplicateProduct.test.ts
git commit -m "feat: add product status labels and duplicate input helpers"
```

---

### Task 3: Status select in the admin product form

**Files:**
- Modify: `src/core/admin/AdminProductForm.tsx`

**Interfaces:**
- Consumes: `PRODUCT_STATUSES`, `productStatusLabel`, `type ProductStatus` from `@/lib/productStatus`; `type ProductInput` from `@/core/admin/duplicateProduct`.
- Produces: `AdminProductForm` now emits `status` and never emits `is_active`.

- [ ] **Step 1: Replace the local ProductInput type with the shared one**

In `src/core/admin/AdminProductForm.tsx`, replace this block:

```ts
import { slugify } from '@/lib/slugify'
import type { Database } from '@/lib/database.types'
import type { PackageUnit } from '@/lib/wholesale'

type Category = Database['public']['Tables']['categories']['Row']
type Product = Database['public']['Tables']['products']['Row']
type ProductInput = Omit<
  Database['public']['Tables']['products']['Insert'],
  'id' | 'created_at' | 'updated_at'
>
```

with:

```ts
import { slugify } from '@/lib/slugify'
import type { Database } from '@/lib/database.types'
import type { PackageUnit } from '@/lib/wholesale'
import { PRODUCT_STATUSES, productStatusLabel, type ProductStatus } from '@/lib/productStatus'
import type { ProductInput } from '@/core/admin/duplicateProduct'

type Category = Database['public']['Tables']['categories']['Row']
type Product = Database['public']['Tables']['products']['Row']
```

- [ ] **Step 2: Swap the form's `is_active` field for `status`**

In the `useState<ProductInput>` initialiser, replace:

```ts
    is_active: initial?.is_active ?? true,
```

with:

```ts
    status: (initial?.status as ProductStatus | undefined) ?? 'draft',
```

A brand-new product defaults to `draft`, not `active` — the admin publishes it deliberately after checking the fields and adding images.

- [ ] **Step 3: Replace the Active checkbox with a status select**

Replace this block:

```tsx
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active ?? true}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        Active (visible in the storefront)
      </label>
```

with:

```tsx
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">สถานะ</Label>
        <select
          id="status"
          value={form.status ?? 'draft'}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {PRODUCT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {productStatusLabel(status)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          เฉพาะสถานะ "เปิดขาย" เท่านั้นที่ลูกค้าเห็นในหน้าร้าน
        </p>
      </div>
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck && npm run lint`
Expected: PASS. If `tsc` reports `is_active` is still referenced in this file, remove the leftover.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/AdminProductForm.tsx
git commit -m "feat: replace product Active checkbox with a status select"
```

---

### Task 4: Duplicate mutation

**Files:**
- Modify: `src/core/admin/useAdminProductMutations.ts`

**Interfaces:**
- Consumes: `nextAvailableSlug`, `buildDuplicateInput`, `type ProductInput` from `@/core/admin/duplicateProduct`.
- Produces: `useAdminProductMutations()` returns `{ createProduct, updateProduct, duplicateProduct }`, where `duplicateProduct.mutateAsync(product: Product)` resolves to the inserted `products` row.

- [ ] **Step 1: Add the duplicate mutation**

Replace the whole of `src/core/admin/useAdminProductMutations.ts` with:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildDuplicateInput, nextAvailableSlug } from '@/core/admin/duplicateProduct'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']
type ProductInsert = Database['public']['Tables']['products']['Insert']
type ProductUpdate = Database['public']['Tables']['products']['Update']

export function useAdminProductMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const createProduct = useMutation({
    mutationFn: async (input: ProductInsert) => {
      const { data, error } = await supabase.from('products').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...input }: ProductUpdate & { id: string }) => {
      const { error } = await supabase.from('products').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // The slug read sees every row, active or not: the "products: admin write"
  // policy is `for all`, so it covers SELECT for admins on top of the
  // is_active-gated public read policy. A concurrent duplicate can still lose
  // the race on products_slug_key; that surfaces as a normal mutation error
  // and the admin retries, which is cheaper than serialising this.
  const duplicateProduct = useMutation({
    mutationFn: async (product: Product) => {
      const { data: existing, error: slugError } = await supabase
        .from('products')
        .select('slug')
        .ilike('slug', `${product.slug}%`)
      if (slugError) throw slugError

      const slug = nextAvailableSlug(
        product.slug,
        (existing ?? []).map((row) => row.slug),
      )
      const { data, error } = await supabase
        .from('products')
        .insert(buildDuplicateInput(product, slug))
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  return { createProduct, updateProduct, duplicateProduct }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/admin/useAdminProductMutations.ts
git commit -m "feat: add duplicateProduct mutation"
```

---

### Task 5: Status filter and Duplicate button on the admin list

**Files:**
- Modify: `src/core/admin/AdminProductListPage.tsx`

**Interfaces:**
- Consumes: `duplicateProduct` from `useAdminProductMutations()`; `PRODUCT_STATUSES`, `productStatusLabel`, `type ProductStatus` from `@/lib/productStatus`.
- Produces: no exported API change; `AdminProductListPage` is still the default export used by `src/App.tsx`.

- [ ] **Step 1: Add the imports and filter state**

In `src/core/admin/AdminProductListPage.tsx`, add to the import block:

```ts
import { PRODUCT_STATUSES, productStatusLabel, type ProductStatus } from '@/lib/productStatus'
```

Pull `duplicateProduct` out of the mutations hook — replace:

```ts
  const { createProduct, updateProduct } = useAdminProductMutations()
```

with:

```ts
  const { createProduct, updateProduct, duplicateProduct } = useAdminProductMutations()
```

Add filter state next to the existing `editing` / `error` state. `'current'` is the default view and hides archived rows, matching Shopify, where archived products are removed from the admin list:

```ts
  const [statusFilter, setStatusFilter] = useState<'current' | 'all' | ProductStatus>('current')
```

- [ ] **Step 2: Filter the rendered rows**

Immediately before the final `return (` of the list view (after the `if (editing)` block), add:

```ts
  const visibleProducts = (products ?? []).filter((product) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'current') return product.status !== 'archived'
    return product.status === statusFilter
  })
```

- [ ] **Step 3: Render the filter bar and switch the list to `visibleProducts`**

Replace the list view's header block:

```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          New product
        </Button>
      </div>
```

with:

```tsx
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          New product
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['current', 'all', ...PRODUCT_STATUSES] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={
              'rounded-full border px-3 py-1 text-xs ' +
              (statusFilter === filter
                ? 'border-foreground font-medium'
                : 'border-input text-muted-foreground hover:text-foreground')
            }
          >
            {filter === 'current'
              ? 'กำลังใช้งาน'
              : filter === 'all'
                ? 'ทั้งหมด'
                : productStatusLabel(filter)}
          </button>
        ))}
      </div>
```

Then change the list's source from `products?.map(...)` to `visibleProducts.map(...)`:

```tsx
        {visibleProducts.map((product) => {
```

- [ ] **Step 4: Show the status badge and the Duplicate button on each row**

Replace the row's name paragraph:

```tsx
                <p className="font-medium">
                  {product.name}
                  {!product.is_active && (
                    <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                  )}
                </p>
```

with:

```tsx
                <p className="font-medium">
                  {product.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({productStatusLabel(product.status)})
                  </span>
                </p>
```

Replace the row's single Edit button:

```tsx
              <Button size="sm" variant="outline" onClick={() => setEditing(product)}>
                Edit
              </Button>
```

with an Edit + Duplicate pair:

```tsx
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(product)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={duplicateProduct.isPending}
                  onClick={async () => {
                    setError(null)
                    try {
                      setEditing(await duplicateProduct.mutateAsync(product))
                    } catch (err) {
                      setError(getErrorMessage(err, 'Failed to duplicate product.'))
                    }
                  }}
                >
                  ทำซ้ำ
                </Button>
              </div>
```

- [ ] **Step 5: Surface list-level errors**

The list view currently has no place to render `error`. Add it directly under the filter bar, so a failed duplicate is visible:

```tsx
      {error && <p className="text-sm text-destructive">{error}</p>}
```

- [ ] **Step 6: Note that images are not duplicated**

In the edit view, under the `<ProductImagesPanel />`, the admin needs to know a copy arrives with no images. Add this line immediately above `{editing !== 'new' && <ProductImagesPanel productId={editing.id} />}`:

```tsx
        {editing !== 'new' && editing.status === 'draft' && (
          <p className="text-sm text-muted-foreground">
            สำเนาสินค้าไม่ได้คัดลอกรูปภาพมาด้วย — กรุณาอัปโหลดรูปใหม่ก่อนเปลี่ยนสถานะเป็น "เปิดขาย"
          </p>
        )}
```

- [ ] **Step 7: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/admin/AdminProductListPage.tsx
git commit -m "feat: add status filter and duplicate action to admin product list"
```

---

### Task 6: End-to-end coverage

**Files:**
- Create: `e2e/product-status-duplicate.spec.ts`

**Interfaces:**
- Consumes: `logIn` from `./helpers/auth`; the seeded `admin@example.com` / `password123` account.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing spec**

Create `e2e/product-status-duplicate.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { logIn } from './helpers/auth'

test('draft products stay off the storefront, and duplicates land as drafts', async ({ page }) => {
  const suffix = `${Date.now()}`
  const name = `Status Probe ${suffix}`
  const slug = `status-probe-${suffix}`

  await logIn(page, { email: 'admin@example.com', password: 'password123' })

  // Create it as a draft.
  await page.goto('/admin/products')
  await page.getByRole('button', { name: 'New product' }).click()
  await page.locator('#name').fill(name)
  await page.locator('#slug').fill(slug)
  await page.locator('#price').fill('1290')
  await page.locator('#status').selectOption('draft')
  await page.getByRole('button', { name: 'Save product' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()

  // A draft is invisible to customers.
  await page.goto(`/products/${slug}`)
  await expect(page.getByText('Product not found.')).toBeVisible()

  // Publishing it makes it visible.
  await page.goto('/admin/products')
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Edit' }).click()
  await page.locator('#status').selectOption('active')
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.goto(`/products/${slug}`)
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Duplicating it produces a draft copy that is still invisible.
  await page.goto('/admin/products')
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()
  await expect(page.locator('#name')).toHaveValue(`${name} (สำเนา)`)
  await expect(page.locator('#slug')).toHaveValue(`${slug}-copy`)
  await expect(page.locator('#sku')).toHaveValue('')
  await expect(page.locator('#status')).toHaveValue('draft')

  await page.goto(`/products/${slug}-copy`)
  await expect(page.getByText('Product not found.')).toBeVisible()

  // Archiving drops the original out of the default admin view. Two rows now
  // carry `name` (the original and its copy), so each lookup is narrowed by
  // the status label as well. Chained `filter` calls are used rather than one
  // combined string because the name and the status badge are separate
  // elements, and JSX strips the whitespace between them.
  await page.goto('/admin/products')
  const originalRow = page
    .getByRole('listitem')
    .filter({ hasText: name })
    .filter({ hasText: 'เปิดขาย' })
  await originalRow.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#status').selectOption('archived')
  await page.getByRole('button', { name: 'Save product' }).click()

  const archivedRow = page
    .getByRole('listitem')
    .filter({ hasText: name })
    .filter({ hasText: 'เลิกขาย' })
  await expect(archivedRow).toHaveCount(0)
  await page.getByRole('button', { name: 'เลิกขาย', exact: true }).click()
  await expect(archivedRow).toHaveCount(1)
})
```

- [ ] **Step 2: Run the spec to verify it passes**

Run: `npm run test:e2e -- e2e/product-status-duplicate.spec.ts`
Expected: PASS. This starts Supabase and resets the DB via `pretest:e2e`; the first run can take a minute or two.

If a row lookup proves ambiguous against the rendered markup, narrow it further with an additional `.filter({ hasText: ... })` — do not weaken the assertions themselves.

- [ ] **Step 3: Run the full suite to catch regressions**

The golden path buys "the first product on /shop", so a stray active probe product could change what it picks. Confirm nothing broke:

Run: `npm run test:e2e`
Expected: PASS, all specs.

- [ ] **Step 4: Commit**

```bash
git add e2e/product-status-duplicate.spec.ts
git commit -m "test: cover product status lifecycle and duplicate action"
```

---

### Task 7: Document the new conventions

**Files:**
- Modify: `CLAUDE.md` (Admin section)

**Interfaces:**
- Consumes: everything above.
- Produces: the written convention future contributors follow.

- [ ] **Step 1: Add the status and duplicate conventions to CLAUDE.md**

In `CLAUDE.md`, in the `## Admin` section, immediately after the bullet beginning "Products and categories are **deactivated (`is_active = false`), never deleted**", insert:

```markdown
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
```

- [ ] **Step 2: Verify the whole suite is still green**

Run: `npm run lint && npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record product status and duplicate conventions"
```
