# Cart + Checkout + Payment Slip Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cart, checkout, and manual bank-transfer payment slip upload flow — Build order Step 4 of the Commerce Starter Kit's Phase 1 core.

**Architecture:** Cart state is a Zustand store persisted to `localStorage` (no `carts` table — confirmed correct in the Step 1 schema design, since `create_order()` re-prices everything server-side, a stale client cart can only produce an "unavailable" error, never a mispriced order). Checkout calls the existing `create_order()` RPC (built in Step 1) with `{product_id, variant_id, quantity}` triples; the server resolves prices, shipping, and the shipping address snapshot and returns the authoritative order. Payment proof is a two-step flow matching Step 1's design exactly: upload to the private `payment-slips` bucket at `{user_id}/{order_id}/...`, then call `attach_payment_slip()` to link it. This plan also adds the site's first persistent header/navigation — without it, the cart (and its item-count badge) has no discoverable entry point, and this is the first step that actually needs one.

**Tech Stack:** React 19, react-router-dom v7, @tanstack/react-query v5, zustand v5 (with `persist` middleware), @supabase/supabase-js v2, Tailwind v4 + shadcn/ui, lucide-react (already a dependency, used here for the cart icon).

## Global Constraints

- No unit test runner in this project — verify each task via `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check (Playwright E2E arrives at Build order Step 8).
- Branding/copy must never be hardcoded outside `src/config/branding.config.ts`.
- `src/core/**` must never import from `src/modules/optional/**`.
- Checkout is `supabase.rpc('create_order', {...})`, never `supabase.from('orders').insert(...)` — there is no INSERT policy on `orders`/`order_items` by design. `create_order`'s TypeScript signature (from `src/lib/database.types.ts`, already generated): `Args: { p_items: Json; p_address_id?: string; p_shipping_address?: Json; p_note?: string }`, `Returns:` a single `orders` row object (not an array, not wrapped in `data[0]`) — the function is declared `returns public.orders`, not `returns setof`.
- `attach_payment_slip`'s signature: `Args: { p_order_id: string; p_path: string; p_note?: string }`, `Returns:` a single `orders` row object. It only succeeds while `orders.status = 'pending'` — once verified/shipped/etc., re-attaching fails with "order not found or no longer awaiting payment."
- Payment slip storage path convention (from the `payment-slips` bucket's RLS policy, Step 1): the **first path segment must be the caller's own `auth.uid()`** — `{user_id}/{order_id}/{unique-suffix}.{ext}`. A path that doesn't start with the caller's own id is rejected by storage RLS before `attach_payment_slip` is ever reached.
- Stock availability is **not** enforced by `create_order()` in Phase 1 — the migration comment explicitly says "stock-automation module hooks in here: check + decrement stock_quantity," meaning that's Phase 2 scope. Do not add client-side stock-blocking logic beyond a courtesy quantity-input cap; `create_order()` only rejects items that are inactive or deleted ("one or more items are unavailable"), never "insufficient stock."
- Variants have no selector UI yet (Phase 2 module) — every cart line this plan creates always has `variantId: null`. Don't build a variant picker.
- Money always renders via `formatPrice()` (`src/lib/formatPrice.ts`, built in Step 3) — never a raw `.toLocaleString()`. Images always resolve via `resolveImageUrl()` (`src/lib/resolveImageUrl.ts`, built in Step 3).
- `useAddresses()` (`src/core/profile/useAddresses.ts`, built in Step 2) already orders results `is_default` descending, so `addresses[0]` is the user's default address when one exists.
- Accepted cosmetic trade-off: several existing pages (`Home`, `LoginPage`, `SignupPage`, `ForgotPasswordPage`, `ResetPasswordPage`) use `min-h-svh` on their own root element. Once Task 2 wraps every route in a header, those pages become slightly taller than one screen (header height + 100svh) rather than exactly one screen. This is a minor, pre-existing-pattern cosmetic issue, not a bug to fix in this plan — do not modify those files to compensate.

---

## Task 1: Cart store

**Files:**
- Create: `src/core/cart/cartStore.ts`

**Interfaces:**
- Produces: `useCartStore` (Zustand hook exposing `{items, addItem, removeItem, updateQuantity, clear}`), `CartItem` type, `useCartTotalItems()`, `useCartSubtotal()`. Used by every later task in this plan.

- [ ] **Step 1: Write the cart store**

Create `src/core/cart/cartStore.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  productId: string
  variantId: string | null
  productName: string
  productSlug: string
  unitPrice: number
  imagePath: string | null
  quantity: number
}

interface CartLine {
  productId: string
  variantId: string | null
}

interface CartState {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  removeItem: (productId: string, variantId: string | null) => void
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void
  clear: () => void
}

function sameLine(a: CartLine, b: CartLine) {
  return a.productId === b.productId && a.variantId === b.variantId
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => sameLine(i, item))
          if (existing) {
            return {
              items: state.items.map((i) =>
                sameLine(i, item) ? { ...i, quantity: i.quantity + quantity } : i,
              ),
            }
          }
          return { items: [...state.items, { ...item, quantity }] }
        }),
      removeItem: (productId, variantId) =>
        set((state) => ({
          items: state.items.filter((i) => !sameLine(i, { productId, variantId })),
        })),
      updateQuantity: (productId, variantId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((i) => !sameLine(i, { productId, variantId })) }
          }
          return {
            items: state.items.map((i) =>
              sameLine(i, { productId, variantId }) ? { ...i, quantity } : i,
            ),
          }
        }),
      clear: () => set({ items: [] }),
    }),
    { name: 'ecom-cart' },
  ),
)

export function useCartTotalItems() {
  return useCartStore((state) => state.items.reduce((sum, i) => sum + i.quantity, 0))
}

export function useCartSubtotal() {
  return useCartStore((state) => state.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0))
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (Nothing renders this store yet.)

- [ ] **Step 3: Commit**

```bash
git add src/core/cart/cartStore.ts
git commit -m "feat(cart): add Zustand cart store persisted to localStorage"
```

---

## Task 2: Site header + layout

**Files:**
- Create: `src/components/SiteHeader.tsx`
- Create: `src/components/SiteLayout.tsx`
- Modify: `src/App.tsx` (full restructure — every route now nests under a layout route)

**Interfaces:**
- Consumes: `useAuth` (`@/core/auth/useAuth`), `useCartTotalItems` (Task 1), `brandConfig`, `Button`.
- Produces: every route in the app now renders inside `<SiteLayout>`, which renders `<SiteHeader>` once and an `<Outlet />` for the page. Later tasks in this plan add new routes inside the same `<Routes>` tree this task establishes.

- [ ] **Step 1: Write `SiteHeader`**

Create `src/components/SiteHeader.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { brandConfig } from '@/config/branding.config'
import { useAuth } from '@/core/auth/useAuth'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'

export function SiteHeader() {
  const { user, signOut } = useAuth()
  const cartCount = useCartTotalItems()

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-semibold">
          {brandConfig.storeName}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/shop" className="hover:underline">
            Shop
          </Link>
          <Link to="/cart" className="relative flex items-center">
            <ShoppingCart className="size-5" />
            {cartCount > 0 && (
              <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {cartCount}
              </span>
            )}
          </Link>
          {user ? (
            <>
              <Link to="/account" className="hover:underline">
                Account
              </Link>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                Log out
              </Button>
            </>
          ) : (
            <Link to="/login" className="hover:underline">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Write `SiteLayout`**

Create `src/components/SiteLayout.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import { SiteHeader } from '@/components/SiteHeader'

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Restructure `App.tsx`**

Replace the full contents of `src/App.tsx` with:

```tsx
import { Routes, Route, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { brandConfig } from '@/config/branding.config'
import { SiteLayout } from '@/components/SiteLayout'
import { LoginPage } from '@/core/auth/LoginPage'
import { SignupPage } from '@/core/auth/SignupPage'
import { ForgotPasswordPage } from '@/core/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/core/auth/ResetPasswordPage'
import { ProtectedRoute } from '@/core/auth/ProtectedRoute'
import { ProfilePage } from '@/core/profile/ProfilePage'
import { AddressBookPage } from '@/core/profile/AddressBookPage'
import { ProductListPage } from '@/core/catalog/ProductListPage'
import { ProductDetailPage } from '@/core/catalog/ProductDetailPage'

function Home() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold">{brandConfig.storeName}</h1>
      <p className="text-muted-foreground">
        Sign in, browse the catalog, and check out below. Admin tools land in a later step.
      </p>
      <Button asChild>
        <Link to="/shop">Shop now</Link>
      </Button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<ProductListPage />} />
        <Route path="/products/:slug" element={<ProductDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<ProfilePage />} />
          <Route path="/account/addresses" element={<AddressBookPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
```

This is the plan's only full-file replacement of `App.tsx` — every later task in this plan adds one new `<Route>` line inside this same tree, the same incremental pattern used in Steps 2 and 3.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, load `/`, confirm the header renders with store name, "Shop" link, cart icon (no badge, cart is empty), and "Log in" link. Click "Shop", confirm `/shop` still works with the header now visible above it. Log in with a test account, confirm the header now shows "Account" and "Log out" instead of "Log in", and that "Log out" returns to the logged-out header state. Confirm every previously-working route (`/shop`, `/products/:slug`, `/login`, `/signup`, `/forgot-password`, `/account`, `/account/addresses`) still renders correctly with the header on top — this task touches every route in the app, so a broad click-through matters more than usual. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteHeader.tsx src/components/SiteLayout.tsx src/App.tsx
git commit -m "feat(cart): add site header/nav and wrap all routes in a shared layout"
```

---

## Task 3: Add to cart on the product detail page

**Files:**
- Modify: `src/core/catalog/ProductDetailPage.tsx`

**Interfaces:**
- Consumes: `useCartStore` (Task 1).
- Produces: nothing new consumed by later tasks — cart state itself is Task 1's job, this task only adds a UI entry point to it.

- [ ] **Step 1: Add a quantity selector and "Add to cart" button**

Edit `src/core/catalog/ProductDetailPage.tsx`. Add `useState` for quantity and an "added" flash, import `useCartStore`, and render the control block below the price/stock section (after the existing `{product.description && ...}` line, still inside the same `<div className="flex flex-col gap-4">`):

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

Inside the component, alongside the existing `activeImageIndex` state:

```tsx
const [quantity, setQuantity] = useState(1)
const [justAdded, setJustAdded] = useState(false)
const addItem = useCartStore((state) => state.addItem)
```

After the product is loaded (so this can reference `product`), compute:

```tsx
const outOfStock = product.track_inventory && product.stock_quantity <= 0
const maxQuantity = product.track_inventory ? Math.max(product.stock_quantity, 1) : 99
```

Add this block at the end of the right-hand column (after the description paragraph):

```tsx
<div className="flex items-center gap-3">
  <Input
    type="number"
    min={1}
    max={maxQuantity}
    value={quantity}
    onChange={(e) => setQuantity(Math.min(maxQuantity, Math.max(1, Number(e.target.value) || 1)))}
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

(`images` is the existing sorted-images array already computed earlier in the component for the gallery — reuse it, don't recompute.)

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, open a product detail page, adjust the quantity, click "Add to cart", confirm "Added ✓" flashes and the header's cart badge (from Task 2) updates to show the correct count. Add the same product again, confirm the quantity merges into the existing line rather than creating a duplicate (check via the cart page once Task 4 exists, or by inspecting `localStorage['ecom-cart']` in devtools now). Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add src/core/catalog/ProductDetailPage.tsx
git commit -m "feat(cart): add quantity selector and Add to cart button to product detail page"
```

---

## Task 4: Cart page

**Files:**
- Create: `src/core/cart/CartPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useCartStore`, `useCartSubtotal` (Task 1), `resolveImageUrl`, `formatPrice`.
- Produces: route `/cart` (public — a guest can view their local cart before logging in; checkout itself is what requires auth, via the existing `<ProtectedRoute />` guard reused in Task 5).

- [ ] **Step 1: Write `CartPage`**

Create `src/core/cart/CartPage.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CartPage() {
  const items = useCartStore((state) => state.items)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const removeItem = useCartStore((state) => state.removeItem)
  const subtotal = useCartSubtotal()

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <Button asChild>
          <Link to="/shop">Continue shopping</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your cart</h1>

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={`${item.productId}:${item.variantId ?? ''}`} className="flex gap-4 border-b pb-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.imagePath && (
                <img
                  src={resolveImageUrl(item.imagePath)}
                  alt={item.productName}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Link to={`/products/${item.productSlug}`} className="font-medium hover:underline">
                {item.productName}
              </Link>
              <span className="text-sm text-muted-foreground">{formatPrice(item.unitPrice)} each</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateQuantity(item.productId, item.variantId, Number(e.target.value) || 0)
                  }
                  className="w-16"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeItem(item.productId, item.variantId)}
                >
                  Remove
                </Button>
              </div>
            </div>
            <span className="font-medium">{formatPrice(item.unitPrice * item.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between text-lg font-medium">
        <span>Subtotal</span>
        <span>{formatPrice(subtotal)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Shipping is calculated when you place your order.
      </p>

      <Button asChild size="lg">
        <Link to="/checkout">Proceed to checkout</Link>
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

Edit `src/App.tsx` — import `CartPage` and add it as a public route (sibling of `/shop`, not inside `<ProtectedRoute />` — a guest can view their cart, only checkout requires login):

```tsx
import { CartPage } from '@/core/cart/CartPage'
// ...
        <Route path="/cart" element={<CartPage />} />
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, add a couple of products to the cart from `/shop`/product pages, visit `/cart`, confirm items/images/prices/subtotal render correctly. Change a quantity, confirm the line total and subtotal update. Remove an item, confirm it disappears and the header badge updates. Empty the cart entirely, confirm the empty-state message appears. Click "Proceed to checkout" while logged out, confirm it redirects to `/login` (via the existing `<ProtectedRoute />` on `/checkout`, added in Task 5 — if Task 5 isn't done yet when you run this check, the link will 404 instead; that's expected at this point in the plan, just confirm the cart page itself renders correctly). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/core/cart/CartPage.tsx src/App.tsx
git commit -m "feat(cart): add cart page with quantity editing and removal"
```

---

## Task 5: Checkout page

**Files:**
- Create: `src/core/checkout/CheckoutPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useCartStore` (Task 1), `useAddresses` (`@/core/profile/useAddresses`, existing), `supabase` (`@/lib/supabase`), `formatPrice`.
- Produces: route `/checkout` inside the existing `<ProtectedRoute />` group. On success, navigates to `/order-confirmation/:orderId` (Task 6's route) passing the real order id returned by `create_order()`.

- [ ] **Step 1: Write `CheckoutPage`**

Create `src/core/checkout/CheckoutPage.tsx`:

```tsx
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { useAddresses } from '@/core/profile/useAddresses'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'

export function CheckoutPage() {
  const navigate = useNavigate()
  const items = useCartStore((state) => state.items)
  const clearCart = useCartStore((state) => state.clear)
  const subtotal = useCartSubtotal()
  const { data: addresses, isLoading: addressesLoading } = useAddresses()
  const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>(undefined)

  const effectiveAddressId = selectedAddressId ?? addresses?.[0]?.id

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_order', {
        p_items: items.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        p_address_id: effectiveAddressId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (order) => {
      clearCart()
      navigate(`/order-confirmation/${order.id}`)
    },
  })

  if (items.length === 0) {
    return <Navigate to="/cart" replace />
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Checkout</h1>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Shipping address</h2>
        {addressesLoading && <p className="text-sm text-muted-foreground">Loading addresses…</p>}
        {!addressesLoading && addresses?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You don't have any saved addresses yet.{' '}
            <Link to="/account/addresses" className="underline">
              Add one
            </Link>{' '}
            before checking out.
          </p>
        )}
        {addresses?.map((address) => (
          <label
            key={address.id}
            className="flex items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-foreground"
          >
            <input
              type="radio"
              name="address"
              checked={effectiveAddressId === address.id}
              onChange={() => setSelectedAddressId(address.id)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{address.recipient_name}</span>
              <span className="block text-muted-foreground">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}, {address.province}{' '}
                {address.postal_code}
              </span>
              <span className="block text-muted-foreground">{address.phone}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="font-medium">Order summary</h2>
        {items.map((item) => (
          <div
            key={`${item.productId}:${item.variantId ?? ''}`}
            className="flex justify-between text-sm"
          >
            <span>
              {item.productName} × {item.quantity}
            </span>
            <span>{formatPrice(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between font-medium">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Shipping is calculated when your order is placed and shown on the confirmation page.
        </p>
      </div>

      {placeOrder.isError && (
        <p className="text-sm text-destructive">
          {placeOrder.error instanceof Error
            ? placeOrder.error.message
            : 'Something went wrong placing your order.'}
        </p>
      )}

      <Button
        size="lg"
        disabled={!effectiveAddressId || placeOrder.isPending}
        onClick={() => placeOrder.mutate()}
      >
        {placeOrder.isPending ? 'Placing order…' : 'Place order'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

Edit `src/App.tsx` — import `CheckoutPage` and add it inside the existing `<Route element={<ProtectedRoute />}>` group (alongside `/account` and `/account/addresses`):

```tsx
import { CheckoutPage } from '@/core/checkout/CheckoutPage'
// ...
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<ProfilePage />} />
          <Route path="/account/addresses" element={<AddressBookPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
        </Route>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in with a test account that has at least one saved address (use `/account/addresses` to add one first if needed), add products to the cart, visit `/checkout`, confirm the address list renders with the default pre-selected, the order summary matches the cart, and "Place order" is enabled. Click it, confirm it navigates to `/order-confirmation/<some-id>` (this route doesn't exist yet — Task 6 adds it, so at this point in the plan you'll briefly see a blank/404 page; that's expected, the important thing to verify here is that the RPC call itself succeeds and the cart is cleared — check `localStorage['ecom-cart']` is now empty, and check the Supabase dashboard or `execute_sql` for a new row in `orders`/`order_items`). Also verify: with zero saved addresses, "Place order" is disabled and the "Add one" prompt shows; with an empty cart, visiting `/checkout` directly redirects to `/cart`. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/core/checkout/CheckoutPage.tsx src/App.tsx
git commit -m "feat(checkout): add checkout page calling create_order RPC"
```

---

## Task 6: Order confirmation + payment slip upload

**Files:**
- Create: `src/core/checkout/OrderConfirmationPage.tsx`
- Modify: `src/config/branding.config.ts` (add bank transfer details, same pattern as Step 3's `currencySymbol` addition)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `supabase`, `formatPrice`, `useAuth` (for the caller's own id, needed to build the storage path).
- Produces: route `/order-confirmation/:orderId` inside `<ProtectedRoute />`. This is the last task in the plan.

- [ ] **Step 1: Add bank transfer details to branding config**

Edit `src/config/branding.config.ts` — add a `bankTransfer` field to `BrandConfig` and `brandConfig`, following the same pattern as the existing `currencySymbol` field:

```ts
export interface BrandConfig {
  storeName: string
  logoUrl: string
  colors: {
    primary: string
    secondary: string
  }
  theme: 'light' | 'dark'
  currencySymbol: string
  bankTransfer: {
    bankName: string
    accountName: string
    accountNumber: string
  }
  features: FeatureFlags
}
```

```ts
export const brandConfig: BrandConfig = {
  storeName: 'Commerce Starter Kit',
  logoUrl: '/favicon.svg',
  colors: {
    primary: 'oklch(0.205 0 0)',
    secondary: 'oklch(0.97 0 0)',
  },
  theme: 'light',
  currencySymbol: '฿',
  bankTransfer: {
    bankName: 'Bank Name',
    accountName: 'Account Holder Name',
    accountNumber: '000-0-00000-0',
  },
  features: {
    // ...unchanged
  },
}
```

(Keep the existing `features` object exactly as it is — only add the two new fields shown above alongside it.)

- [ ] **Step 2: Write `OrderConfirmationPage`**

Create `src/core/checkout/OrderConfirmationPage.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import { formatPrice } from '@/lib/formatPrice'
import { brandConfig } from '@/config/branding.config'
import { Button } from '@/components/ui/button'

function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!orderId,
    retry: false,
  })
}

export function OrderConfirmationPage() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError } = useOrder(orderId)
  const [file, setFile] = useState<File | null>(null)

  const uploadSlip = useMutation({
    mutationFn: async () => {
      if (!file || !user || !order) throw new Error('Missing file')
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${order.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('payment-slips')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { error: attachError } = await supabase.rpc('attach_payment_slip', {
        p_order_id: order.id,
        p_path: path,
      })
      if (attachError) throw attachError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      setFile(null)
    },
  })

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError || !order) return <p className="p-8 text-destructive">Order not found.</p>

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Order #{order.order_number}</h1>
      <p className="text-sm text-muted-foreground">Status: {order.status}</p>

      <div className="flex flex-col gap-2 border-y py-4">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.product_name} × {item.quantity}
            </span>
            <span>{formatPrice(item.line_total)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Shipping</span>
          <span>{formatPrice(order.shipping_fee)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>

      {order.status === 'pending' && !order.payment_slip_path && (
        <div className="flex flex-col gap-3">
          <h2 className="font-medium">Pay by bank transfer</h2>
          <div className="rounded-md border p-3 text-sm">
            <p>{brandConfig.bankTransfer.bankName}</p>
            <p>{brandConfig.bankTransfer.accountName}</p>
            <p>{brandConfig.bankTransfer.accountNumber}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Transfer {formatPrice(order.total)} and upload your payment slip below.
          </p>
          <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} />
          {uploadSlip.isError && (
            <p className="text-sm text-destructive">
              {uploadSlip.error instanceof Error
                ? uploadSlip.error.message
                : 'Failed to upload payment slip.'}
            </p>
          )}
          <Button disabled={!file || uploadSlip.isPending} onClick={() => uploadSlip.mutate()}>
            {uploadSlip.isPending ? 'Uploading…' : 'Upload payment slip'}
          </Button>
        </div>
      )}

      {order.status === 'pending' && order.payment_slip_path && (
        <p className="text-sm text-muted-foreground">
          Payment slip received — we'll verify it shortly.
        </p>
      )}

      {order.status !== 'pending' && (
        <p className="text-sm text-muted-foreground">
          This order is {order.status}.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Register the route**

Edit `src/App.tsx` — import `OrderConfirmationPage` and add it inside the existing `<ProtectedRoute />` group:

```tsx
import { OrderConfirmationPage } from '@/core/checkout/OrderConfirmationPage'
// ...
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<ProfilePage />} />
          <Route path="/account/addresses" element={<AddressBookPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />
        </Route>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify end-to-end: `npm run dev`, log in, add a product to cart, go through `/checkout` → "Place order", confirm you land on `/order-confirmation/<id>` showing the correct line items, subtotal, shipping fee, and total (all server-computed — compare the total against subtotal + shipping shown). Confirm the bank transfer panel and file input render. Upload an image file as the payment slip, confirm it succeeds and the page switches to "Payment slip received — we'll verify it shortly." with the upload form gone. Reload the page, confirm the "received" state persists (i.e. it's reading `payment_slip_path` from the database, not just local state). Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/checkout/OrderConfirmationPage.tsx src/config/branding.config.ts src/App.tsx
git commit -m "feat(checkout): add order confirmation page with payment slip upload"
```

---

## After this plan

Update CLAUDE.md's "Project status" to mark Step 4 done, and add a short section documenting the cart/checkout/slip-upload conventions (Zustand store shape, the two-step slip upload, `create_order`/`attach_payment_slip` usage) the way Step 2 and Step 3 each did for their areas. Step 5 (Order history) gets its own plan when picked up next — it's a natural follow-on since `OrderConfirmationPage`'s single-order view and a future order-list page will likely share the line-item rendering.
