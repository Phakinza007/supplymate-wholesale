# Admin Product + Category CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin area for managing categories and products, including product image upload — Build order Step 6 of the Commerce Starter Kit's Phase 1 core. This is the first feature to use `<AdminRoute />` (built in Step 2, never wired into any route until now).

**Architecture:** A single `AdminLayout` (nav: Products / Categories) wraps every route under `/admin`, gated by `<AdminRoute />` — a sibling of the existing `<ProtectedRoute />` group, not nested inside it, since `AdminRoute` already redirects unauthenticated visitors to `/login` on its own. Category and product list pages reuse the exact single-page list-or-form pattern established by `AddressBookPage` in Step 2 (`editing: T | 'new' | null` local state) rather than separate route-per-form pages — consistent with the rest of this codebase and avoiding a second navigation layer for what's fundamentally a two-state view. All admin mutations rely on the `categories`/`products`/`product_images: admin insert/update/delete` RLS policies and the `product-images` storage bucket's admin write policies from Step 1 — no new database migrations needed.

**Tech Stack:** React 19, react-router-dom v7, @tanstack/react-query v5, @supabase/supabase-js v2, Tailwind v4 + shadcn/ui.

## Global Constraints

- No unit test runner in this project — verify each task via `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check (Playwright E2E arrives at Build order Step 8).
- **Products and categories are deactivated, never deleted, from this UI** — the Step 1 schema design's explicit convention: `is_active = false` is the safety net, hard delete stays possible outside the app (SQL/dashboard) but this plan does not build a delete button anywhere. Every list/form only ever toggles `is_active`.
- Admin RLS is already in place from Step 1: `categories`/`products`/`product_images` each have `admin insert`/`admin update`/`admin delete` policies gated on `public.is_admin()`, and their `read` policies already return inactive rows to admins (`is_active OR is_admin()`) — admin queries in this plan intentionally select **all** rows, not just `is_active = true` ones (that filter is the Step 3 storefront's job, not this one).
- The `product-images` storage bucket (from Step 1) is public-read, admin-write, 5MB limit, `image/jpeg|png|webp|avif` only. Its RLS write policies gate on `public.is_admin()`, no path-ownership convention is required (unlike `payment-slips`) — this plan's path convention is `{product_id}/{uuid}.{ext}`, grouped by product so deleting a product's image folder later is a simple prefix operation.
- Reuse existing utilities, don't reinvent them: `formatPrice()` (`@/lib/formatPrice`), `resolveImageUrl()` (`@/lib/resolveImageUrl`), `cn()` (`@/lib/utils`), and — after Task 1 — `getErrorMessage()` (`@/lib/getErrorMessage`).
- `AdminRoute` (`src/core/auth/AdminRoute.tsx`, built in Step 2) already exists and already redirects non-admins to `/` and unauthenticated visitors to `/login` — this plan only adds routes inside it, never modifies it.
- Admin bootstrap reminder (already documented in CLAUDE.md, not this plan's job): promoting the first admin is `update public.profiles set role = 'admin' where email = '<email>'`, done by hand — there's no UI path, by design, to block self-promotion.
- Forward-referencing links to routes not yet built by an earlier task in this plan is expected and fine (established pattern from every prior Step) — each task's own manual verification only covers what that task actually built.

---

## Task 1: Shared error-message helper (pays down flagged Step 2/4/5 debt)

**Files:**
- Create: `src/lib/getErrorMessage.ts`
- Modify: `src/core/checkout/CheckoutPage.tsx`
- Modify: `src/core/orders/OrderDetailPage.tsx`
- Modify: `src/core/profile/AddressBookPage.tsx`
- Modify: `src/core/profile/ProfilePage.tsx`

**Interfaces:**
- Produces: `getErrorMessage(error: unknown, fallback: string): string`, used by every mutation-error render in this plan's later tasks (Tasks 4, 6, 7) and retrofitted onto the 4 existing call sites above.

CLAUDE.md already documents why this is needed: *"Supabase RPC/PostgREST errors are plain objects, not `Error` instances — a bare `error instanceof Error` check silently swallows every real server message... this same latent bug still exists in `AddressBookPage.tsx` and `ProfilePage.tsx`... worth fixing next time those files are touched, and now duplicated across `core/checkout/` and `core/orders/` — a shared helper is warranted once a fourth or fifth call site shows up."* This plan adds three more call sites (Tasks 4, 6, 7), which is that trigger point.

- [ ] **Step 1: Write the shared helper**

Create `src/lib/getErrorMessage.ts`:

```ts
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return fallback
}
```

- [ ] **Step 2: Retrofit `CheckoutPage.tsx` and `OrderDetailPage.tsx`**

Both files currently define their own local, identical copy of this exact function. Remove each local definition and replace it with `import { getErrorMessage } from '@/lib/getErrorMessage'` — the call sites (`getErrorMessage(placeOrder.error, ...)`, `getErrorMessage(uploadSlip.error, ...)`) don't change, only where the function comes from.

- [ ] **Step 3: Retrofit `AddressBookPage.tsx` and `ProfilePage.tsx`**

Both files currently catch a mutation error with a pattern like `err instanceof Error ? err.message : '<fallback text>'` (inline in a `catch` block, not a named local function like the two files above). Find each occurrence in both files and replace it with `getErrorMessage(err, '<the same fallback text that was already there>')`, adding `import { getErrorMessage } from '@/lib/getErrorMessage'` to each file. Don't change the fallback text itself, and don't change anything else about the surrounding error-handling logic — this is a mechanical swap of the check, not a rewrite.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, exercise one flow per retrofitted file if convenient (e.g. try updating your profile with the network offline briefly, or just confirm each page still renders and its normal happy-path save/submit still works — the goal is confirming the swap didn't break normal operation, not re-testing error paths that were already covered in earlier steps). Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/lib/getErrorMessage.ts src/core/checkout/CheckoutPage.tsx src/core/orders/OrderDetailPage.tsx src/core/profile/AddressBookPage.tsx src/core/profile/ProfilePage.tsx
git commit -m "refactor: extract shared getErrorMessage helper, retrofit all call sites"
```

---

## Task 2: Admin layout + route scaffold

**Files:**
- Create: `src/core/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: every route under `/admin` renders inside `<AdminLayout>` (nav + `<Outlet />`), reachable only through `<AdminRoute />`. `/admin` itself redirects to `/admin/products`. The `products`/`categories` child routes are added by Tasks 4 and 6 — this task only establishes the parent route and an index redirect, so it compiles standalone without depending on pages that don't exist yet.

- [ ] **Step 1: Write `AdminLayout`**

Create `src/core/admin/AdminLayout.tsx`:

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
]

export function AdminLayout() {
  const location = useLocation()

  return (
    <div className="flex flex-col gap-6">
      <nav className="mx-auto flex w-full max-w-3xl gap-4 border-b px-4 pt-8 pb-2 text-sm">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'pb-2',
              location.pathname.startsWith(item.to)
                ? 'border-b-2 border-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
```

- [ ] **Step 2: Wire the route scaffold**

Edit `src/App.tsx` — import `AdminRoute` from `@/core/auth/AdminRoute`, `AdminLayout` from `@/core/admin/AdminLayout`, and `Navigate` from `react-router-dom` (add to the existing `react-router-dom` import). Add a new top-level group as a sibling of the existing `<Route element={<ProtectedRoute />}>` group (same nesting depth, inside `<Route element={<SiteLayout />}>`):

```tsx
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
          </Route>
        </Route>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as a non-admin account, navigate to `/admin`, confirm you're redirected to `/` (per `AdminRoute`'s existing behavior). Log in as (or promote via SQL) an admin test account, navigate to `/admin`, confirm you're redirected to `/admin/products` and see the nav bar with "Products"/"Categories" (both links currently lead nowhere — expected, Tasks 4 and 6 add those pages). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/core/admin/AdminLayout.tsx src/App.tsx
git commit -m "feat(admin): add admin layout and route scaffold"
```

---

## Task 3: Admin category hooks

**Files:**
- Create: `src/core/admin/useAdminCategories.ts`
- Create: `src/core/admin/useAdminCategoryMutations.ts`

**Interfaces:**
- Produces: `useAdminCategories(): UseQueryResult<CategoryRow[]>` (all categories, active and inactive, ordered by `sort_order`), `useAdminCategoryMutations(): { createCategory, updateCategory }`. Used by Task 4.

- [ ] **Step 1: Write `useAdminCategories`**

Create `src/core/admin/useAdminCategories.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 2: Write `useAdminCategoryMutations`**

Create `src/core/admin/useAdminCategoryMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type CategoryInsert = Database['public']['Tables']['categories']['Insert']
type CategoryUpdate = Database['public']['Tables']['categories']['Update']

export function useAdminCategoryMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
  }

  const createCategory = useMutation({
    mutationFn: async (input: CategoryInsert) => {
      const { error } = await supabase.from('categories').insert(input)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...input }: CategoryUpdate & { id: string }) => {
      const { error } = await supabase.from('categories').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createCategory, updateCategory }
}
```

`invalidate()` also invalidates the Step 3 storefront's `['categories']` query key, so an admin testing their own edits sees them reflected immediately if they navigate to `/shop` in the same session.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (Nothing renders these hooks yet.)

- [ ] **Step 4: Commit**

```bash
git add src/core/admin/useAdminCategories.ts src/core/admin/useAdminCategoryMutations.ts
git commit -m "feat(admin): add admin category query and mutation hooks"
```

---

## Task 4: Category form + list page

**Files:**
- Create: `src/lib/slugify.ts`
- Create: `src/core/admin/AdminCategoryForm.tsx`
- Create: `src/core/admin/AdminCategoryListPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAdminCategories`, `useAdminCategoryMutations` (Task 3), `getErrorMessage` (Task 1).
- Produces: route `/admin/categories`, nested inside the `/admin` parent route from Task 2. `slugify()` is reused by Task 6.

- [ ] **Step 1: Write `slugify`**

Create `src/lib/slugify.ts`:

```ts
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 2: Write `AdminCategoryForm`**

Create `src/core/admin/AdminCategoryForm.tsx`:

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slugify } from '@/lib/slugify'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['categories']['Row']
type CategoryInput = Omit<
  Database['public']['Tables']['categories']['Insert'],
  'id' | 'created_at' | 'updated_at'
>

export function AdminCategoryForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Category
  categories: Category[]
  onSubmit: (input: CategoryInput) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<CategoryInput>({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    parent_id: initial?.parent_id ?? null,
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  })

  function field(key: 'name' | 'slug' | 'description') {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  function handleNameBlur() {
    if (!form.slug) {
      setForm((f) => ({ ...f, slug: slugify(f.name ?? '') }))
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required {...field('name')} onBlur={handleNameBlur} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" required {...field('slug')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" {...field('description')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="parent">Parent category</Label>
        <select
          id="parent"
          value={form.parent_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value || null }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">None</option>
          {categories
            .filter((c) => c.id !== initial?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sort_order">Sort order</Label>
        <Input
          id="sort_order"
          type="number"
          value={form.sort_order ?? 0}
          onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active ?? true}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        Active (visible in the storefront)
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save category'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Write `AdminCategoryListPage`**

Create `src/core/admin/AdminCategoryListPage.tsx`:

```tsx
import { useState } from 'react'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminCategoryMutations } from '@/core/admin/useAdminCategoryMutations'
import { AdminCategoryForm } from '@/core/admin/AdminCategoryForm'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['categories']['Row']

export function AdminCategoryListPage() {
  const { data: categories, isLoading } = useAdminCategories()
  const { createCategory, updateCategory } = useAdminCategoryMutations()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto max-w-lg px-4 pb-8">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'New category' : 'Edit category'}
        </h1>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <AdminCategoryForm
          initial={initial}
          categories={categories ?? []}
          submitting={createCategory.isPending || updateCategory.isPending}
          onCancel={() => {
            setEditing(null)
            setError(null)
          }}
          onSubmit={async (input) => {
            setError(null)
            try {
              if (editing === 'new') {
                await createCategory.mutateAsync(input)
              } else {
                await updateCategory.mutateAsync({ id: editing.id, ...input })
              }
              setEditing(null)
            } catch (err) {
              setError(getErrorMessage(err, 'Failed to save category.'))
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          New category
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {categories?.map((category) => (
          <li
            key={category.id}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {category.name}
                {!category.is_active && (
                  <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                )}
              </p>
              <p className="text-muted-foreground">/{category.slug}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(category)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Register the route**

Edit `src/App.tsx` — import `AdminCategoryListPage` and add it as a child of the `/admin` route created in Task 2:

```tsx
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="categories" element={<AdminCategoryListPage />} />
          </Route>
        </Route>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as admin, navigate to `/admin/categories`, confirm existing seeded categories list correctly. Create a new category (type a name, tab away from it, confirm the slug auto-fills, adjust if desired, save), confirm it appears in the list. Edit an existing category (change its name, toggle it inactive), confirm the change persists and the "(inactive)" tag shows. Set a parent category on one, confirm it saves (no direct UI feedback needed for hierarchy yet — just confirm no error and the DB write succeeds). Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/lib/slugify.ts src/core/admin/AdminCategoryForm.tsx src/core/admin/AdminCategoryListPage.tsx src/App.tsx
git commit -m "feat(admin): add category create/edit form and list page"
```

---

## Task 5: Admin product hooks

**Files:**
- Create: `src/core/admin/useAdminProducts.ts`
- Create: `src/core/admin/useAdminProductMutations.ts`

**Interfaces:**
- Produces: `useAdminProducts(): UseQueryResult<Array<ProductRow & {categories: {name: string} | null}>>` (all products, active and inactive, joined with category name), `useAdminProductMutations(): { createProduct, updateProduct }` where `createProduct` resolves to the newly-created row (needed by Task 6 to "graduate" a new product straight into edit mode). Used by Task 6.

- [ ] **Step 1: Write `useAdminProducts`**

Create `src/core/admin/useAdminProducts.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 2: Write `useAdminProductMutations`**

Create `src/core/admin/useAdminProductMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

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

  return { createProduct, updateProduct }
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (Nothing renders these hooks yet.)

- [ ] **Step 4: Commit**

```bash
git add src/core/admin/useAdminProducts.ts src/core/admin/useAdminProductMutations.ts
git commit -m "feat(admin): add admin product query and mutation hooks"
```

---

## Task 6: Product form + list page

**Files:**
- Create: `src/core/admin/AdminProductForm.tsx`
- Create: `src/core/admin/AdminProductListPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAdminProducts`, `useAdminProductMutations` (Task 5), `useAdminCategories` (Task 3), `getErrorMessage` (Task 1), `slugify` (Task 4), `formatPrice` (existing).
- Produces: route `/admin/products`. This task deliberately does NOT include product image management — that's Task 7, which modifies this page's edit-mode view to add an images panel below the form once a product exists (i.e. not for a brand-new, not-yet-saved product).

- [ ] **Step 1: Write `AdminProductForm`**

Create `src/core/admin/AdminProductForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slugify } from '@/lib/slugify'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['categories']['Row']
type Product = Database['public']['Tables']['products']['Row']
type ProductInput = Omit<
  Database['public']['Tables']['products']['Insert'],
  'id' | 'created_at' | 'updated_at'
>

export function AdminProductForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Product
  categories: Category[]
  onSubmit: (input: ProductInput) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<ProductInput>({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? 0,
    compare_at_price: initial?.compare_at_price ?? null,
    sku: initial?.sku ?? '',
    stock_quantity: initial?.stock_quantity ?? 0,
    track_inventory: initial?.track_inventory ?? true,
    category_id: initial?.category_id ?? null,
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  })

  function handleNameBlur() {
    if (!form.slug) {
      setForm((f) => ({ ...f, slug: slugify(f.name ?? '') }))
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onBlur={handleNameBlur}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          required
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">Price (THB)</Label>
          <Input
            id="price"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="compare_at_price">Compare-at price</Label>
          <Input
            id="compare_at_price"
            type="number"
            min={0}
            step="0.01"
            value={form.compare_at_price ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                compare_at_price: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            value={form.sku ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value || null }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="stock_quantity">Stock quantity</Label>
          <Input
            id="stock_quantity"
            type="number"
            min={0}
            value={form.stock_quantity ?? 0}
            onChange={(e) =>
              setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) || 0 }))
            }
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          value={form.category_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value || null }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sort_order">Sort order</Label>
        <Input
          id="sort_order"
          type="number"
          value={form.sort_order ?? 0}
          onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.track_inventory ?? true}
          onChange={(e) => setForm((f) => ({ ...f, track_inventory: e.target.checked }))}
        />
        Track inventory
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active ?? true}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        Active (visible in the storefront)
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save product'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Write `AdminProductListPage`**

Create `src/core/admin/AdminProductListPage.tsx`:

```tsx
import { useState } from 'react'
import { useAdminProducts } from '@/core/admin/useAdminProducts'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminProductMutations } from '@/core/admin/useAdminProductMutations'
import { AdminProductForm } from '@/core/admin/AdminProductForm'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']

export function AdminProductListPage() {
  const { data: products, isLoading } = useAdminProducts()
  const { data: categories } = useAdminCategories()
  const { createProduct, updateProduct } = useAdminProductMutations()
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto max-w-lg px-4 pb-8">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'New product' : 'Edit product'}
        </h1>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <AdminProductForm
          initial={initial}
          categories={categories ?? []}
          submitting={createProduct.isPending || updateProduct.isPending}
          onCancel={() => {
            setEditing(null)
            setError(null)
          }}
          onSubmit={async (input) => {
            setError(null)
            try {
              if (editing === 'new') {
                const created = await createProduct.mutateAsync(input)
                setEditing(created)
              } else {
                await updateProduct.mutateAsync({ id: editing.id, ...input })
                setEditing(null)
              }
            } catch (err) {
              setError(getErrorMessage(err, 'Failed to save product.'))
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          New product
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {products?.map((product) => (
          <li
            key={product.id}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {product.name}
                {!product.is_active && (
                  <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {product.categories?.name ?? 'Uncategorized'} · {formatPrice(product.price)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(product)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Note: when creating a new product, `onSubmit` calls `setEditing(created)` (not `setEditing(null)`) — this keeps the same page open in edit mode for the just-created product, which is what lets Task 7's image panel (shown only for an existing, saved product) appear immediately after creation without a separate navigation step.

- [ ] **Step 3: Register the route**

Edit `src/App.tsx` — import `AdminProductListPage` and add it as a child of the `/admin` route, alongside `categories`:

```tsx
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="products" element={<AdminProductListPage />} />
            <Route path="categories" element={<AdminCategoryListPage />} />
          </Route>
        </Route>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as admin, navigate to `/admin/products`, confirm the 4 seeded products list with correct category names and prices. Create a new product (fill in name/price, confirm slug auto-fills), save, confirm the page stays open in edit mode for the newly-created product (not back at the list) — this is the "graduate to edit mode" behavior Task 7 depends on. Edit an existing product (change price, toggle inactive), confirm it saves and the list reflects the change. Assign/change a category, confirm it saves. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/AdminProductForm.tsx src/core/admin/AdminProductListPage.tsx src/App.tsx
git commit -m "feat(admin): add product create/edit form and list page"
```

---

## Task 7: Product image management

**Files:**
- Create: `src/core/admin/useProductImages.ts`
- Create: `src/core/admin/ProductImagesPanel.tsx`
- Modify: `src/core/admin/AdminProductListPage.tsx`

**Interfaces:**
- Consumes: `resolveImageUrl`, `getErrorMessage`.
- Produces: nothing consumed by later tasks — this is the last product-management piece.

- [ ] **Step 1: Write `useProductImages`**

Create `src/core/admin/useProductImages.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductImages(productId: string) {
  return useQuery({
    queryKey: ['admin-product-images', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useProductImageMutations(productId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-product-images', productId] })

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${productId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase
        .from('product_images')
        .insert({ product_id: productId, storage_path: path })
      if (insertError) throw insertError
    },
    onSuccess: invalidate,
  })

  const deleteImage = useMutation({
    mutationFn: async (image: { id: string; storage_path: string }) => {
      const { error: removeError } = await supabase.storage
        .from('product-images')
        .remove([image.storage_path])
      if (removeError) throw removeError

      const { error: deleteError } = await supabase
        .from('product_images')
        .delete()
        .eq('id', image.id)
      if (deleteError) throw deleteError
    },
    onSuccess: invalidate,
  })

  return { uploadImage, deleteImage }
}
```

- [ ] **Step 2: Write `ProductImagesPanel`**

Create `src/core/admin/ProductImagesPanel.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import { useProductImages, useProductImageMutations } from '@/core/admin/useProductImages'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { getErrorMessage } from '@/lib/getErrorMessage'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif'

export function ProductImagesPanel({ productId }: { productId: string }) {
  const { data: images, isLoading } = useProductImages(productId)
  const { uploadImage, deleteImage } = useProductImageMutations(productId)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Image must be under 5MB.')
      e.target.value = ''
      return
    }
    try {
      await uploadImage.mutateAsync(file)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to upload image.'))
    }
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Images</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {images?.map((image) => (
          <div key={image.id} className="relative h-24 w-24 overflow-hidden rounded-md border">
            <img
              src={resolveImageUrl(image.storage_path)}
              alt={image.alt ?? ''}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => deleteImage.mutate(image)}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
              aria-label="Delete image"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        onChange={handleFileChange}
        disabled={uploadImage.isPending}
      />
    </div>
  )
}
```

- [ ] **Step 3: Wire the panel into the product edit view**

Edit `src/core/admin/AdminProductListPage.tsx` — import `ProductImagesPanel`, and change the `editing` truthy branch's returned JSX from a single `<div className="mx-auto max-w-lg px-4 pb-8">...</div>` into a wrapper that also renders the images panel, but **only when editing an existing product** (`editing !== 'new'` — a brand-new, not-yet-saved product has no `id` to group images under):

```tsx
  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-4 pb-8">
        <div>
          <h1 className="mb-6 text-2xl font-semibold">
            {editing === 'new' ? 'New product' : 'Edit product'}
          </h1>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          <AdminProductForm
            initial={initial}
            categories={categories ?? []}
            submitting={createProduct.isPending || updateProduct.isPending}
            onCancel={() => {
              setEditing(null)
              setError(null)
            }}
            onSubmit={async (input) => {
              setError(null)
              try {
                if (editing === 'new') {
                  const created = await createProduct.mutateAsync(input)
                  setEditing(created)
                } else {
                  await updateProduct.mutateAsync({ id: editing.id, ...input })
                  setEditing(null)
                }
              } catch (err) {
                setError(getErrorMessage(err, 'Failed to save product.'))
              }
            }}
          />
        </div>
        {editing !== 'new' && <ProductImagesPanel productId={editing.id} />}
      </div>
    )
  }
```

(This replaces the existing `mx-auto max-w-lg px-4 pb-8` wrapper `<div>` with the `flex flex-col gap-8` version shown above, and moves the heading/error/form into a nested `<div>`. The rest of the file — the list view below this block — is unchanged.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as admin, edit an existing product, confirm the images panel appears below the form showing any existing seeded image. Upload a new image (a real JPEG/PNG under 5MB), confirm it appears in the panel without a page reload. Delete an image, confirm it disappears from the panel. Try uploading an oversized file (if convenient) and confirm the client-side size error shows instead of attempting the upload. Create a brand-new product, confirm the images panel does NOT appear until after the first save (when `editing` becomes the created product object). Navigate to `/shop` and the new product's detail page, confirm an uploaded image actually renders there too (proving the storage path/RLS/public-read chain works end-to-end, not just in the admin view). Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/useProductImages.ts src/core/admin/ProductImagesPanel.tsx src/core/admin/AdminProductListPage.tsx
git commit -m "feat(admin): add product image upload and management"
```

---

## Task 8: Make the admin area discoverable

**Files:**
- Modify: `src/components/SiteHeader.tsx`

**Interfaces:**
- Consumes: `useProfile` (`@/core/auth/useProfile`, existing) — `SiteHeader` doesn't currently call this, only `useAuth()`.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Add an "Admin" link visible only to admins**

Edit `src/components/SiteHeader.tsx` — import `useProfile` from `@/core/auth/useProfile`, call it alongside the existing `useAuth()`, and add a conditional "Admin" link inside the `user ? (...)` branch, shown only when `profile?.role === 'admin'`:

```tsx
const { user, signOut } = useAuth()
const { data: profile } = useProfile()
const cartCount = useCartTotalItems()
```

```tsx
{user ? (
  <>
    {profile?.role === 'admin' && (
      <Link to="/admin" className="hover:underline">
        Admin
      </Link>
    )}
    <Link to="/orders" className="hover:underline">
      Orders
    </Link>
    <Link to="/account" className="hover:underline">
      Account
    </Link>
    <Button variant="outline" size="sm" onClick={() => signOut()}>
      Log out
    </Button>
  </>
) : (
  // ...unchanged
)}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as a non-admin account, confirm no "Admin" link appears in the header. Log in as an admin account, confirm "Admin" appears and navigates to `/admin` (which redirects to `/admin/products`). Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add src/components/SiteHeader.tsx
git commit -m "feat(admin): show an Admin link in the header for admin accounts"
```

---

## After this plan

Update CLAUDE.md's "Project status" to mark Step 6 done, and add a short section documenting the admin conventions (deactivate-not-delete, the list-or-form single-page pattern, the `product-images/{product_id}/{uuid}.ext` path convention, and the now-shared `getErrorMessage` helper's location). Step 7 (Admin order management) gets its own plan when picked up next — CLAUDE.md already has two standing notes for it from Steps 4 and 5: build a separate `AdminOrderDetailPage` rather than extending the customer-facing one, and null `payment_slip_path` as part of the reject action.
