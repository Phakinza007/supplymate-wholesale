# Order History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the user-facing order history — a list of the current user's past orders and a detail view for each — Build order Step 5 of the Commerce Starter Kit's Phase 1 core.

**Architecture:** `src/core/checkout/OrderConfirmationPage.tsx` (built in Step 4) already implements a fully generic, RLS-scoped, fetch-by-id order detail view with line items, totals, status, and payment slip upload — it has no special-casing for "just came from checkout." Rather than duplicate that rendering logic for order history (which the Step 4 final review flagged as a near-certain need), this plan relocates it into `src/core/orders/` as `OrderDetailPage`, retargets its route from `/order-confirmation/:orderId` to `/orders/:orderId`, and points checkout's post-order navigation at the same route. A new `useOrders()` hook and `OrderListPage` add the list view on top. Both list and detail rely entirely on the existing `orders: read` RLS policy (`user_id = auth.uid() OR is_admin()`) for ownership scoping — no additional client-side filtering needed.

**Tech Stack:** React 19, react-router-dom v7, @tanstack/react-query v5, @supabase/supabase-js v2, Tailwind v4 + shadcn/ui.

## Global Constraints

- No unit test runner in this project — verify each task via `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check (Playwright E2E arrives at Build order Step 8).
- Money via `formatPrice()` (`src/lib/formatPrice.ts`), never raw formatting.
- `src/core/**` must never import from `src/modules/optional/**`.
- Accepted simplification: no pagination on the order list in this plan — a personal order history is expected to be small. Revisit if it becomes a real problem later; don't build it preemptively.
- `orders` table columns relevant here: `id, order_number, status, subtotal, shipping_fee, total, payment_slip_path, created_at` (full column list from Step 1's migration). RLS (`orders: read`) already restricts `SELECT` to `user_id = auth.uid()` or an admin — no explicit ownership filter is needed in queries, only `.order()`/`.select()`.
- `OrderConfirmationPage.tsx`'s existing code (being relocated, not rewritten, in Task 2) already handles: `.maybeSingle()` + `retry: false` for the not-found case, the three-way pending/slip-uploaded/not-pending status UI, and the `getErrorMessage()` helper for Supabase's non-`Error` RPC error shape. Preserve all of it exactly — this task is a move + rename + route change, not a rewrite.

---

## Task 1: `useOrders` hook

**Files:**
- Create: `src/core/orders/useOrders.ts`

**Interfaces:**
- Produces: `useOrders(): UseQueryResult<Array<{id, order_number, status, total, created_at}>>`, used by Task 3's list page.

- [ ] **Step 1: Write `useOrders`**

Create `src/core/orders/useOrders.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'

export function useOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (Nothing renders this hook yet.)

- [ ] **Step 3: Commit**

```bash
git add src/core/orders/useOrders.ts
git commit -m "feat(orders): add useOrders hook for the current user's order list"
```

---

## Task 2: Relocate order detail view to `/orders/:orderId`

**Files:**
- Create: `src/core/orders/OrderDetailPage.tsx`
- Delete: `src/core/checkout/OrderConfirmationPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/core/checkout/CheckoutPage.tsx`

**Interfaces:**
- Produces: route `/orders/:orderId` (replaces `/order-confirmation/:orderId`). Checkout's success handler now navigates here. Task 3's order list links here.

- [ ] **Step 1: Create `OrderDetailPage.tsx` with the exact content of the existing `OrderConfirmationPage.tsx`, renamed**

Create `src/core/orders/OrderDetailPage.tsx` with this exact content (identical to the current `src/core/checkout/OrderConfirmationPage.tsx`, only the exported function name changes from `OrderConfirmationPage` to `OrderDetailPage`):

```tsx
import { useState, type ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import { formatPrice } from '@/lib/formatPrice'
import { brandConfig } from '@/config/branding.config'
import { Button } from '@/components/ui/button'

const MAX_SLIP_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_SLIP_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return fallback
}

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

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError } = useOrder(orderId)
  const [file, setFile] = useState<File | null>(null)

  const uploadSlip = useMutation({
    mutationFn: async () => {
      if (!file || !user || !order) throw new Error('Missing file')
      if (file.size > MAX_SLIP_SIZE_BYTES) throw new Error('File must be under 5MB.')
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
            <span>{formatPrice(item.line_total ?? item.unit_price * item.quantity)}</span>
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
          <input type="file" accept={ACCEPTED_SLIP_TYPES} onChange={handleFileChange} />
          {uploadSlip.isError && (
            <p className="text-sm text-destructive">
              {getErrorMessage(uploadSlip.error, 'Failed to upload payment slip.')}
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
        <p className="text-sm text-muted-foreground">This order is {order.status}.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete the old file**

```bash
git rm src/core/checkout/OrderConfirmationPage.tsx
```

- [ ] **Step 3: Update `App.tsx`'s route**

Edit `src/App.tsx`:
- Change the import from `import { OrderConfirmationPage } from '@/core/checkout/OrderConfirmationPage'` to `import { OrderDetailPage } from '@/core/orders/OrderDetailPage'`.
- Change the route from `<Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />` to `<Route path="/orders/:orderId" element={<OrderDetailPage />} />`, keeping it in the same place inside the `<ProtectedRoute />` group.

- [ ] **Step 4: Update `CheckoutPage.tsx`'s post-order navigation**

Edit `src/core/checkout/CheckoutPage.tsx` — in the `placeOrder` mutation's `onSuccess`, change `navigate(\`/order-confirmation/${order.id}\`)` to `navigate(\`/orders/${order.id}\`)`. Also update the explanatory comment above `orderPlacedRef` (currently references "/order-confirmation") to say "/orders/:orderId" instead, so it stays accurate.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in, add a product to cart, complete checkout, confirm you land on `/orders/<id>` (not `/order-confirmation/<id>`) and the page renders exactly as it did before this task (line items, totals, status, bank transfer panel, slip upload). Confirm `/order-confirmation/<any-id>` now 404s (no route matches). Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/core/orders/OrderDetailPage.tsx src/App.tsx src/core/checkout/CheckoutPage.tsx
git commit -m "refactor(orders): relocate order detail view to /orders/:orderId"
```

---

## Task 3: Order list page

**Files:**
- Create: `src/core/orders/OrderListPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useOrders` (Task 1).
- Produces: route `/orders`, linking to `/orders/:orderId` (Task 2).

- [ ] **Step 1: Write `OrderListPage`**

Create `src/core/orders/OrderListPage.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { useOrders } from '@/core/orders/useOrders'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'

export function OrderListPage() {
  const { data: orders, isLoading, isError } = useOrders()

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError) return <p className="p-8 text-destructive">Failed to load orders.</p>

  if (orders && orders.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">No orders yet</h1>
        <Button asChild>
          <Link to="/shop">Start shopping</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your orders</h1>
      <ul className="flex flex-col gap-3">
        {orders?.map((order) => (
          <li key={order.id}>
            <Link
              to={`/orders/${order.id}`}
              className="flex items-center justify-between rounded-md border p-4 text-sm hover:border-foreground/30"
            >
              <div>
                <p className="font-medium">Order #{order.order_number}</p>
                <p className="text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString()} · {order.status}
                </p>
              </div>
              <span className="font-medium">{formatPrice(order.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

Edit `src/App.tsx` — import `OrderListPage` and add it inside the existing `<Route element={<ProtectedRoute />}>` group, before `/orders/:orderId` (order matters for react-router-dom's path matching — a static `/orders` segment before the dynamic `/orders/:orderId` route, though React Router v7 resolves this correctly either way; placing the static route first is the conventional order):

```tsx
import { OrderListPage } from '@/core/orders/OrderListPage'
// ...
          <Route path="/orders" element={<OrderListPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in with an account that has at least one past order (place one via checkout if needed), visit `/orders`, confirm it lists the order(s) with correct order number, date, status, and total, sorted newest-first. Click one, confirm it navigates to the correct `/orders/:orderId` detail view. Log in with (or create) an account with zero orders, visit `/orders`, confirm the empty state renders. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/core/orders/OrderListPage.tsx src/App.tsx
git commit -m "feat(orders): add order list page"
```

---

## Task 4: Make order history discoverable

**Files:**
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/core/profile/ProfilePage.tsx`

**Interfaces:**
- Consumes: nothing new — both are simple link additions.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add an "Orders" link to the header**

Edit `src/components/SiteHeader.tsx` — inside the `user ? (...)` branch, add a link to `/orders` before the existing "Account" link:

```tsx
{user ? (
  <>
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

- [ ] **Step 2: Add a link from the profile page**

Edit `src/core/profile/ProfilePage.tsx` — add a link to `/orders` alongside the existing "Manage address book" link:

```tsx
<Link to="/account/addresses" className="text-sm hover:underline">
  Manage address book
</Link>
<Link to="/orders" className="text-sm hover:underline">
  View order history
</Link>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in, confirm "Orders" appears in the header nav and navigates to `/orders`, and confirm "View order history" appears on `/account` and does the same. Log out, confirm "Orders" disappears from the header (logged-out nav is unchanged). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/components/SiteHeader.tsx src/core/profile/ProfilePage.tsx
git commit -m "feat(orders): link order history from the header and profile page"
```

---

## After this plan

Update CLAUDE.md's "Project status" to mark Step 5 done, and note the `/orders`/`/orders/:orderId` route split and the fact that `OrderDetailPage` is shared between post-checkout and order-history navigation (so a future change to one path's needs shouldn't silently break the other). Step 6 (Admin product/category CRUD) gets its own plan when picked up next.
