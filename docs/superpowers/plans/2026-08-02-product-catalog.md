# Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public product catalog — a category-filtered, searchable, paginated product list and a product detail page — Build order Step 3 of the Commerce Starter Kit's Phase 1 core.

**Architecture:** Two TanStack Query hooks (`useCategories`, `useProducts`) drive a list page whose category/search/page state lives in the URL (`useSearchParams`), so filters are shareable and back-button-safe. A third hook (`useProduct`) drives the detail page. All three query `public.categories`/`public.products`/`public.product_images` directly via the typed `supabase` client — RLS already restricts results to `is_active` rows for anonymous/non-admin visitors (Step 1), and these queries additionally filter `is_active` explicitly at the query level since this is the customer-facing catalog, not an admin preview. No cart/checkout wiring in this plan — an "Add to cart" affordance is Step 4's job.

**Tech Stack:** React 19, react-router-dom v7 (`useSearchParams`), @tanstack/react-query v5, @supabase/supabase-js v2, Tailwind v4 + shadcn/ui.

## Global Constraints

- No unit test runner in this project — verify each task via `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check (established in Step 2; Playwright E2E arrives at Build order Step 8).
- Branding/copy must never be hardcoded outside `src/config/branding.config.ts`.
- `src/core/**` must never import from `src/modules/optional/**` (enforced by `npm run lint`).
- Reviews and Q&A are explicitly out of scope for this plan (core spec: "product catalog (list+detail, no reviews)") — do not add gated placeholders or lazy-import stubs for them; those modules don't exist yet, and an empty gate is dead code. A later optional-module plan adds them without touching these files.
- `products` columns: `id, category_id, slug, name, description, price, compare_at_price, sku, stock_quantity, track_inventory, has_variants, is_active, sort_order, metadata, created_at, updated_at`. `categories` columns: `id, parent_id, slug, name, description, image_path, sort_order, is_active`. `product_images` columns: `id, product_id, storage_path, alt, sort_order`.
- `product_images.storage_path` may hold either a path in the public `product-images` storage bucket, or (for seed/demo rows) an absolute `http(s)://` URL — see Task 1's resolver, which is the one place this distinction is handled.
- Money: `price`/`compare_at_price` are `numeric(12,2)` — format as Thai baht (฿) using `Number(price).toLocaleString()`, no currency-conversion logic.
- The Supabase project ref is supplied through the private deployment environment; catalog seed rows (2 categories, 4 products, 4 images from `supabase/seed.sql`) will already exist in the hosted project by the time Task 1 starts — the controller seeds them before dispatching, so every task's manual verification has real data to check against.

---

## Task 1: Image resolver + `useCategories`

**Files:**
- Create: `src/lib/resolveImageUrl.ts`
- Create: `src/core/catalog/useCategories.ts`

**Interfaces:**
- Produces: `resolveImageUrl(path: string): string` — used by every later task that renders a product or category image. `useCategories(): UseQueryResult<Database['public']['Tables']['categories']['Row'][]>` — used by Task 3's category filter.

- [ ] **Step 1: Write the image resolver**

Create `src/lib/resolveImageUrl.ts`:

```ts
import { supabase } from '@/lib/supabase'

/**
 * product_images.storage_path and categories.image_path are either a path in
 * the public `product-images` bucket, or (for seed/demo rows) an absolute
 * http(s) URL. This is the one place that distinction is handled.
 */
export function resolveImageUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}
```

- [ ] **Step 2: Write `useCategories`**

Create `src/core/catalog/useCategories.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/resolveImageUrl.ts src/core/catalog/useCategories.ts
git commit -m "feat(catalog): add image resolver and useCategories hook"
```

---

## Task 2: `useProducts`

**Files:**
- Create: `src/core/catalog/useProducts.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`).
- Produces: `useProducts(params: { categoryId?: string; search?: string; page: number; pageSize?: number }): UseQueryResult<{ products: ProductWithImages[]; totalCount: number }>` where `ProductWithImages = Database['public']['Tables']['products']['Row'] & { product_images: Database['public']['Tables']['product_images']['Row'][] }`. Used by Task 3's list page.

- [ ] **Step 1: Write `useProducts`**

Create `src/core/catalog/useProducts.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const DEFAULT_PAGE_SIZE = 12

export function useProducts(params: {
  categoryId?: string
  search?: string
  page: number
  pageSize?: number
}) {
  const { categoryId, search, page, pageSize = DEFAULT_PAGE_SIZE } = params

  return useQuery({
    queryKey: ['products', { categoryId, search, page, pageSize }],
    queryFn: async () => {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('products')
        .select('*, product_images(*)', { count: 'exact' })
        .eq('is_active', true)

      if (categoryId) {
        query = query.eq('category_id', categoryId)
      }
      if (search) {
        query = query.ilike('name', `%${search}%`)
      }

      const { data, error, count } = await query
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error
      return { products: data, totalCount: count ?? 0 }
    },
  })
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (No route renders this hook yet — that's Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/core/catalog/useProducts.ts
git commit -m "feat(catalog): add useProducts hook (paginated, filterable, searchable)"
```

---

## Task 3: Product list page

**Files:**
- Create: `src/core/catalog/ProductCard.tsx`
- Create: `src/core/catalog/ProductListPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 1), `useProducts` (Task 2), `resolveImageUrl` (Task 1), `Button`/`Input` from `@/components/ui/*`, `cn` from `@/lib/utils`.
- Produces: route `/shop`, reading/writing `category`, `q`, and `page` URL search params. `ProductCard` is also reused by Task 4 unused here (detail page does not use it) — no, scratch that: `ProductCard` is only used by this task's page; Task 4 builds its own layout.

- [ ] **Step 1: Write `ProductCard`**

Create `src/core/catalog/ProductCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row'] & {
  product_images: Database['public']['Tables']['product_images']['Row'][]
}

export function ProductCard({ product }: { product: Product }) {
  const image = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex flex-col gap-2 rounded-md border p-3 transition-colors hover:border-foreground/30"
    >
      <div className="aspect-square overflow-hidden rounded-sm bg-muted">
        {image && (
          <img
            src={resolveImageUrl(image.storage_path)}
            alt={image.alt ?? product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
      </div>
      <div>
        <p className="font-medium">{product.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm">฿{Number(product.price).toLocaleString()}</span>
          {product.compare_at_price && (
            <span className="text-sm text-muted-foreground line-through">
              ฿{Number(product.compare_at_price).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Write `ProductListPage`**

Create `src/core/catalog/ProductListPage.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCategories } from '@/core/catalog/useCategories'
import { useProducts } from '@/core/catalog/useProducts'
import { ProductCard } from '@/core/catalog/ProductCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 12

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categorySlug = searchParams.get('category') ?? undefined
  const search = searchParams.get('q') ?? undefined
  const page = Number(searchParams.get('page') ?? '1')

  const [searchInput, setSearchInput] = useState(search ?? '')

  const { data: categories } = useCategories()
  const activeCategory = categories?.find((c) => c.slug === categorySlug)

  const { data, isLoading, isError } = useProducts({
    categoryId: activeCategory?.id,
    search,
    page,
    pageSize: PAGE_SIZE,
  })

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    setSearchParams(params)
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    updateParams({ q: searchInput || undefined, page: undefined })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search products…"
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateParams({ category: undefined, page: undefined })}
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            !categorySlug ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          All
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => updateParams({ category: cat.slug, page: undefined })}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              categorySlug === cat.slug ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-destructive">Failed to load products.</p>}
      {data && data.products.length === 0 && (
        <p className="text-muted-foreground">No products found.</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {data?.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

Edit `src/App.tsx` — import `ProductListPage` and add a public route:

```tsx
import { ProductListPage } from '@/core/catalog/ProductListPage'
// ...
      <Route path="/shop" element={<ProductListPage />} />
```

Add this route alongside the existing public routes (`/`, `/login`, etc.), not inside the `<ProtectedRoute />` group.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, navigate to `/shop`. Confirm the 4 seeded products render with images, prices, and names. Click a category pill, confirm the grid filters to that category and the URL gains `?category=...`. Clear it via "All". Search for a product name substring, confirm the grid filters and the URL gains `?q=...`. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/catalog/ProductCard.tsx src/core/catalog/ProductListPage.tsx src/App.tsx
git commit -m "feat(catalog): add product list page with category filter, search, pagination"
```

---

## Task 4: Product detail page

**Files:**
- Create: `src/core/catalog/useProduct.ts`
- Create: `src/core/catalog/ProductDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `resolveImageUrl` (Task 1), `useParams` from react-router-dom, `Button` from `@/components/ui/button`.
- Produces: route `/products/:slug`.

- [ ] **Step 1: Write `useProduct`**

Create `src/core/catalog/useProduct.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(*), categories(name, slug)')
        .eq('slug', slug!)
        .eq('is_active', true)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!slug,
  })
}
```

- [ ] **Step 2: Write `ProductDetailPage`**

Create `src/core/catalog/ProductDetailPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'

export function ProductDetailPage() {
  const { slug } = useParams()
  const { data: product, isLoading, isError } = useProduct(slug)
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError || !product) return <p className="p-8 text-destructive">Product not found.</p>

  const images = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)
  const activeImage = images[activeImageIndex]

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      {product.categories && (
        <Link
          to={`/shop?category=${product.categories.slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {product.categories.name}
        </Link>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="aspect-square overflow-hidden rounded-md bg-muted">
            {activeImage && (
              <img
                src={resolveImageUrl(activeImage.storage_path)}
                alt={activeImage.alt ?? product.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.map((image, i) => (
                <button
                  key={image.id}
                  onClick={() => setActiveImageIndex(i)}
                  className={
                    'h-16 w-16 overflow-hidden rounded-sm border ' +
                    (i === activeImageIndex ? 'border-foreground' : 'border-transparent')
                  }
                >
                  <img
                    src={resolveImageUrl(image.storage_path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xl">฿{Number(product.price).toLocaleString()}</span>
            {product.compare_at_price && (
              <span className="text-muted-foreground line-through">
                ฿{Number(product.compare_at_price).toLocaleString()}
              </span>
            )}
          </div>
          {product.track_inventory && (
            <p className="text-sm text-muted-foreground">
              {product.stock_quantity > 0
                ? `${product.stock_quantity} in stock`
                : 'Out of stock'}
            </p>
          )}
          {product.description && <p className="text-sm">{product.description}</p>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

Edit `src/App.tsx` — import `ProductDetailPage` and add a public route:

```tsx
import { ProductDetailPage } from '@/core/catalog/ProductDetailPage'
// ...
      <Route path="/products/:slug" element={<ProductDetailPage />} />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, navigate to `/shop`, click a product card, confirm the detail page shows the correct name/price/description/image, and the category breadcrumb link navigates back to `/shop?category=...` correctly filtered. Try a nonexistent slug (e.g. `/products/does-not-exist`), confirm "Product not found." renders instead of a crash. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/catalog/useProduct.ts src/core/catalog/ProductDetailPage.tsx src/App.tsx
git commit -m "feat(catalog): add product detail page"
```

---

## Task 5: Wire the home page into the catalog

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only changes a link target.

- [ ] **Step 1: Point "Shop now" at `/shop`**

Edit `src/App.tsx`'s `Home` component — replace the inert `<Button>Shop now</Button>` with a link to the catalog:

```tsx
import { Link } from 'react-router-dom'
// ...
      <Button asChild>
        <Link to="/shop">Shop now</Link>
      </Button>
```

(`Button`'s `asChild` prop already exists from Step 0's shadcn setup — it renders the child element instead of a `<button>`, so the link remains a single accessible anchor.)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, load `/`, click "Shop now", confirm it navigates to `/shop`. Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(catalog): link home page's Shop now button to /shop"
```

---

## After this plan

Update CLAUDE.md's "Project status" to mark Step 3 done. Step 4 (Cart + checkout + slip upload) gets its own plan when picked up next.
