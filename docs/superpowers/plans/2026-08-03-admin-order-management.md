# Admin Order Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin order queue and detail view, including payment verification, shipping, completion, cancellation, and slip-rejection actions — Build order Step 7 of the Commerce Starter Kit's Phase 1 core.

**Architecture:** Order status changes are direct `supabase.from('orders').update({status: ...})` calls, not an RPC — the DB trigger `enforce_order_status_transition` (Step 1) validates every transition and derives lifecycle timestamps automatically, so the client only ever states the desired status. This plan builds a genuinely separate `AdminOrderDetailPage` rather than extending the customer-facing `OrderDetailPage` (an explicit standing note in CLAUDE.md since Step 5), because the two speak in different voices (admin sees customer identity, shipping controls, and every order regardless of owner; the customer page never should) and because bolting admin branching onto the customer page would fight both.

**Tech Stack:** React 19, react-router-dom v7, @tanstack/react-query v5, @supabase/supabase-js v2, Tailwind v4 + shadcn/ui.

## Global Constraints

- No unit test runner in this project — verify each task via `npm run typecheck`, `npm run lint`, `npm run build`, and a manual browser check (Playwright E2E arrives at Build order Step 8).
- **Every list/detail page in this plan must handle `isError`, not just `isLoading`, from the moment it's written** — a lesson from Step 6's final review: a failed query with only an `isLoading` check renders as an empty/blank page indistinguishable from "nothing here," and an admin acting on that can make wrong decisions. Follow `OrderListPage`'s existing pattern (`<p className="p-8 text-destructive">Failed to load ...</p>`).
- **Rejecting a payment slip must null `payment_slip_path` and `payment_slip_uploaded_at`** — an explicit standing note in CLAUDE.md since Step 4/5: without this, the customer-facing `OrderDetailPage` has no way to show a re-upload prompt after a rejection, since it gates the upload form on `!payment_slip_path`.
- The order status transition matrix (enforced server-side by the Step 1 trigger, mirror it in the UI only to grey out invalid actions — never trust the UI as the real gate): `pending -> verified | cancelled`; `verified -> shipped | pending (slip rejected) | cancelled`; `shipped -> done | cancelled`; `done`/`cancelled` are terminal. The client only ever sends the *target* status; the trigger derives `verified_at`/`verified_by`/`shipped_at`/`completed_at`/`cancelled_at` itself — never set these columns from the client.
- Admin order queries (`useAdminOrders`, `useAdminOrder`) intentionally select **all** orders regardless of owner — this is the correct, deliberate admin-sees-everything behavior (unlike Step 5's `useOrders()`, which was a bug precisely because that hook was supposed to be "my own orders only"). Don't add a `user_id` filter here.
- `orders.status` is `text` + `CHECK`, not a Postgres enum (Step 1 design rationale: the value set may need per-client extension later) — `src/lib/database.types.ts` types it as a bare `string`. Define an explicit `OrderStatus` union type in this plan's own code (Task 1) rather than trusting the generated type.
- Payment slips live in the private `payment-slips` bucket — admins read them via `supabase.storage.from('payment-slips').createSignedUrl(path, 60)` (60s TTL, matching the security posture documented in Step 1: short-lived signed URLs, never a public URL, never the service-role key in the browser). The bucket accepts images AND PDFs — render the slip as a plain link that opens in a new tab, not an `<img>` tag, since an inline `<img src>` breaks silently for a PDF.
- Reuse existing utilities: `formatPrice()`, `getErrorMessage()`, `cn()`, `Button`/`Input`/`Label` from `@/components/ui/*`. No new shared utility is needed for this plan.
- `AdminLayout`'s nav (`src/core/admin/AdminLayout.tsx`, Step 6) currently has two items (Products, Categories) — this plan adds a third ("Orders").

---

## Task 1: Admin order hooks

**Files:**
- Create: `src/core/admin/useAdminOrders.ts`
- Create: `src/core/admin/useAdminOrder.ts`

**Interfaces:**
- Produces: `ORDER_STATUSES` (const array), `OrderStatus` (union type) — reused by Tasks 2, 4, 5. `useAdminOrders(statusFilter?: OrderStatus): UseQueryResult<...>` (list, all orders) — used by Task 2. `useAdminOrder(orderId: string | undefined): UseQueryResult<...>` (single order + items + status history, all orders) — used by Tasks 3 and 5.

- [ ] **Step 1: Write `useAdminOrders`**

Create `src/core/admin/useAdminOrders.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const ORDER_STATUSES = ['pending', 'verified', 'shipped', 'done', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export function useAdminOrders(statusFilter?: OrderStatus) {
  return useQuery({
    queryKey: ['admin-orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, order_number, customer_name, status, total, created_at')
        .order('created_at', { ascending: false })
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 2: Write `useAdminOrder`**

Create `src/core/admin/useAdminOrder.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), order_status_history(*)')
        .eq('id', orderId!)
        .order('created_at', { referencedTable: 'order_status_history', ascending: true })
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!orderId,
    retry: false,
  })
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (Nothing renders these hooks yet.)

- [ ] **Step 4: Commit**

```bash
git add src/core/admin/useAdminOrders.ts src/core/admin/useAdminOrder.ts
git commit -m "feat(admin): add admin order query hooks"
```

---

## Task 2: Order list page

**Files:**
- Create: `src/core/admin/AdminOrderListPage.tsx`
- Modify: `src/core/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAdminOrders`, `ORDER_STATUSES`, `OrderStatus` (Task 1), `formatPrice`, `cn`.
- Produces: route `/admin/orders`, linking to `/admin/orders/:orderId` (Task 3).

- [ ] **Step 1: Write `AdminOrderListPage`**

Create `src/core/admin/AdminOrderListPage.tsx`:

```tsx
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminOrders, ORDER_STATUSES, type OrderStatus } from '@/core/admin/useAdminOrders'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

export function AdminOrderListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = (searchParams.get('status') as OrderStatus | null) ?? undefined
  const { data: orders, isLoading, isError } = useAdminOrders(statusFilter)

  function setStatus(status: OrderStatus | undefined) {
    const params = new URLSearchParams(searchParams)
    if (status) params.set('status', status)
    else params.delete('status')
    setSearchParams(params)
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError) return <p className="p-8 text-destructive">Failed to load orders.</p>

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-8">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatus(undefined)}
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            !statusFilter ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          All
        </button>
        {ORDER_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatus(status)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm capitalize',
              statusFilter === status ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {status}
          </button>
        ))}
      </div>
      {orders?.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders found.</p>
      )}
      <ul className="flex flex-col gap-2">
        {orders?.map((order) => (
          <li key={order.id}>
            <Link
              to={`/admin/orders/${order.id}`}
              className="flex items-center justify-between rounded-md border p-3 text-sm hover:border-foreground/30"
            >
              <div>
                <p className="font-medium">
                  Order #{order.order_number} · {order.customer_name}
                </p>
                <p className="text-muted-foreground capitalize">
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

- [ ] **Step 2: Add "Orders" to the admin nav**

Edit `src/core/admin/AdminLayout.tsx` — add a third entry to `NAV_ITEMS`:

```ts
const NAV_ITEMS = [
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
]
```

- [ ] **Step 3: Register the route**

Edit `src/App.tsx` — import `AdminOrderListPage` and add it as a sibling of the existing `products`/`categories` routes inside the `/admin` block:

```tsx
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="products" element={<AdminProductListPage />} />
            <Route path="categories" element={<AdminCategoryListPage />} />
            <Route path="orders" element={<AdminOrderListPage />} />
          </Route>
        </Route>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as admin (promote a test account via Supabase MCP `execute_sql` on the owned hosted project if needed, demote back afterward), navigate to `/admin/orders` (also confirm the new "Orders" nav link works), confirm any existing orders list with correct order number/customer/status/total. Click a status filter pill, confirm the list filters and the URL gains `?status=...`. Click "All" to clear it. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/AdminOrderListPage.tsx src/core/admin/AdminLayout.tsx src/App.tsx
git commit -m "feat(admin): add order list page with status filter"
```

---

## Task 3: Order detail page (read-only)

**Files:**
- Create: `src/core/admin/AdminOrderDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAdminOrder` (Task 1), `formatPrice`, `supabase`.
- Produces: route `/admin/orders/:orderId`. No status-change actions yet — those are Task 5, built on top of this read-only view.

- [ ] **Step 1: Write `AdminOrderDetailPage`**

Create `src/core/admin/AdminOrderDetailPage.tsx`:

```tsx
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAdminOrder } from '@/core/admin/useAdminOrder'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'

function useSignedSlipUrl(path: string | null) {
  return useQuery({
    queryKey: ['admin-slip-url', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('payment-slips')
        .createSignedUrl(path!, 60)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
  })
}

export function AdminOrderDetailPage() {
  const { orderId } = useParams()
  const { data: order, isLoading, isError } = useAdminOrder(orderId)
  const { data: slipUrl } = useSignedSlipUrl(order?.payment_slip_path ?? null)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError || !order) return <p className="p-8 text-destructive">Order not found.</p>

  const address = order.shipping_address as {
    recipient_name?: string
    phone?: string
    line1?: string
    line2?: string
    province?: string
    postal_code?: string
  } | null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Order #{order.order_number}</h1>
        <p className="text-sm capitalize text-muted-foreground">Status: {order.status}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
        <h2 className="font-medium">Customer</h2>
        <p>{order.customer_name}</p>
        <p className="text-muted-foreground">{order.customer_phone}</p>
        {order.customer_email && (
          <p className="text-muted-foreground">{order.customer_email}</p>
        )}
        {order.customer_note && (
          <p className="text-muted-foreground">Note: {order.customer_note}</p>
        )}
      </div>

      {address && (
        <div className="flex flex-col gap-1 rounded-md border p-4 text-sm">
          <h2 className="font-medium">Shipping address</h2>
          <p>{address.recipient_name}</p>
          <p className="text-muted-foreground">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}, {address.province} {address.postal_code}
          </p>
          <p className="text-muted-foreground">{address.phone}</p>
        </div>
      )}

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

      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Payment slip</h2>
        {slipUrl ? (
          <a
            href={slipUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline"
          >
            View payment slip →
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">No payment slip uploaded yet.</p>
        )}
        {order.payment_note && (
          <p className="text-sm text-muted-foreground">Note: {order.payment_note}</p>
        )}
      </div>

      {order.tracking_number && (
        <div className="text-sm">
          <h2 className="font-medium">Shipping</h2>
          <p className="text-muted-foreground">
            {order.shipping_carrier} · {order.tracking_number}
          </p>
        </div>
      )}

      {order.order_status_history.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-medium">History</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {order.order_status_history.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.created_at).toLocaleString()} — {entry.from_status ?? 'created'} →{' '}
                {entry.to_status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

Edit `src/App.tsx` — import `AdminOrderDetailPage` and add it as a sibling of `orders` inside the `/admin` block:

```tsx
            <Route path="orders" element={<AdminOrderListPage />} />
            <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify: `npm run dev`, log in as admin, navigate to `/admin/orders`, click into an order that has a payment slip uploaded (place one via checkout as a test customer first if none exist), confirm the detail page shows customer info, shipping address, line items, totals, and a working "View payment slip →" link that opens the actual slip in a new tab. Confirm the status history list shows at least the initial `created → pending` entry. Click into an order with no slip yet, confirm "No payment slip uploaded yet." renders instead of a broken link. Try a nonexistent order id, confirm "Order not found." renders. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/core/admin/AdminOrderDetailPage.tsx src/App.tsx
git commit -m "feat(admin): add read-only order detail page with signed slip URL"
```

---

## Task 4: Order status mutations

**Files:**
- Create: `src/core/admin/useAdminOrderMutations.ts`

**Interfaces:**
- Produces: `useAdminOrderMutations(orderId: string): { verifyPayment, rejectSlip, shipOrder, completeOrder, cancelOrder }`. Used by Task 5.

- [ ] **Step 1: Write `useAdminOrderMutations`**

Create `src/core/admin/useAdminOrderMutations.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminOrderMutations(orderId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] })
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  }

  const verifyPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'verified' })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const rejectSlip = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'pending', payment_slip_path: null, payment_slip_uploaded_at: null })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const shipOrder = useMutation({
    mutationFn: async (input: { tracking_number?: string; shipping_carrier?: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'shipped', ...input })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const completeOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('orders').update({ status: 'done' }).eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const cancelOrder = useMutation({
    mutationFn: async (cancel_reason: string) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled', cancel_reason })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { verifyPayment, rejectSlip, shipOrder, completeOrder, cancelOrder }
}
```

`rejectSlip` nulling `payment_slip_path`/`payment_slip_uploaded_at` is the standing CLAUDE.md requirement from Step 4/5 — without it, the customer-facing `OrderDetailPage` (`src/core/orders/OrderDetailPage.tsx`) has no way to know a re-upload is needed, since it only shows the upload form when `!payment_slip_path`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. (No UI calls these yet — that's Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/core/admin/useAdminOrderMutations.ts
git commit -m "feat(admin): add order status transition mutations"
```

---

## Task 5: Wire status actions into the detail page

**Files:**
- Modify: `src/core/admin/AdminOrderDetailPage.tsx`

**Interfaces:**
- Consumes: `useAdminOrderMutations` (Task 4), `getErrorMessage`, `Button`/`Input`/`Label`.
- Produces: nothing new consumed elsewhere — this is the plan's last task.

- [ ] **Step 1: Add imports and local state**

Edit `src/core/admin/AdminOrderDetailPage.tsx` — add these imports:

```tsx
import { useState } from 'react'
import { useAdminOrderMutations } from '@/core/admin/useAdminOrderMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
```

Inside the component, after the existing `order`/`slipUrl` hooks (and after the `isLoading`/`isError` early returns, since these hooks need `order.id`):

```tsx
const { verifyPayment, rejectSlip, shipOrder, completeOrder, cancelOrder } =
  useAdminOrderMutations(order.id)
const [actionError, setActionError] = useState<string | null>(null)
const [trackingNumber, setTrackingNumber] = useState('')
const [shippingCarrier, setShippingCarrier] = useState('')
const [showCancelForm, setShowCancelForm] = useState(false)
const [cancelReason, setCancelReason] = useState('')
```

- [ ] **Step 2: Add the status-action block**

Add this block at the end of the returned JSX, after the existing "History" section (still inside the outer `<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-8">`):

```tsx
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {order.status === 'pending' && (
        <Button
          disabled={!order.payment_slip_path || verifyPayment.isPending}
          onClick={async () => {
            setActionError(null)
            try {
              await verifyPayment.mutateAsync()
            } catch (err) {
              setActionError(getErrorMessage(err, 'Failed to verify payment.'))
            }
          }}
        >
          {verifyPayment.isPending ? 'Verifying…' : 'Verify payment'}
        </Button>
      )}

      {order.status === 'verified' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tracking">Tracking number</Label>
            <Input
              id="tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
            <Label htmlFor="carrier">Shipping carrier</Label>
            <Input
              id="carrier"
              value={shippingCarrier}
              onChange={(e) => setShippingCarrier(e.target.value)}
            />
            <Button
              disabled={shipOrder.isPending}
              onClick={async () => {
                setActionError(null)
                try {
                  await shipOrder.mutateAsync({
                    tracking_number: trackingNumber || undefined,
                    shipping_carrier: shippingCarrier || undefined,
                  })
                } catch (err) {
                  setActionError(getErrorMessage(err, 'Failed to mark as shipped.'))
                }
              }}
            >
              {shipOrder.isPending ? 'Saving…' : 'Mark as shipped'}
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={rejectSlip.isPending}
            onClick={async () => {
              setActionError(null)
              try {
                await rejectSlip.mutateAsync()
              } catch (err) {
                setActionError(getErrorMessage(err, 'Failed to reject slip.'))
              }
            }}
          >
            {rejectSlip.isPending ? 'Rejecting…' : 'Reject slip (request re-upload)'}
          </Button>
        </div>
      )}

      {order.status === 'shipped' && (
        <Button
          disabled={completeOrder.isPending}
          onClick={async () => {
            setActionError(null)
            try {
              await completeOrder.mutateAsync()
            } catch (err) {
              setActionError(getErrorMessage(err, 'Failed to mark as done.'))
            }
          }}
        >
          {completeOrder.isPending ? 'Saving…' : 'Mark as done'}
        </Button>
      )}

      {(order.status === 'pending' || order.status === 'verified' || order.status === 'shipped') && (
        <div className="flex flex-col gap-2 border-t pt-4">
          {!showCancelForm ? (
            <Button variant="destructive" size="sm" onClick={() => setShowCancelForm(true)}>
              Cancel order
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancel-reason">Cancellation reason</Label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!cancelReason || cancelOrder.isPending}
                  onClick={async () => {
                    setActionError(null)
                    try {
                      await cancelOrder.mutateAsync(cancelReason)
                      setShowCancelForm(false)
                    } catch (err) {
                      setActionError(getErrorMessage(err, 'Failed to cancel order.'))
                    }
                  }}
                >
                  {cancelOrder.isPending ? 'Cancelling…' : 'Confirm cancel'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCancelForm(false)}>
                  Never mind
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {(order.status === 'done' || order.status === 'cancelled') && (
        <p className="text-sm text-muted-foreground">
          This order is {order.status}
          {order.status === 'cancelled' && order.cancel_reason ? `: ${order.cancel_reason}` : '.'}
        </p>
      )}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Manually verify the full lifecycle end-to-end: `npm run dev`, as a test customer, place an order and upload a payment slip (the well-tested Step 4 flow). As admin, open that order's detail page — confirm "Verify payment" is enabled (slip exists) and clicking it moves the order to `verified` (page updates, status history gains an entry). Confirm the "Mark as shipped" form appears; fill in a tracking number, submit, confirm the order moves to `shipped` and the tracking info now displays. Confirm "Mark as done" appears and moves the order to `done`, after which no action buttons remain — just the status text. Separately, test the reject path: get another order to `verified`, click "Reject slip", confirm it bounces back to `pending` with "No payment slip uploaded yet." showing (proving `payment_slip_path` was actually nulled) — then, as the customer, reload that order's `/orders/:orderId` page and confirm the upload form has reappeared. Also test cancellation from `pending` with a reason. Confirm a `pending` order with no slip yet has "Verify payment" disabled. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/core/admin/AdminOrderDetailPage.tsx
git commit -m "feat(admin): wire order status actions (verify, ship, complete, reject, cancel)"
```

---

## After this plan

Update CLAUDE.md's "Project status" to mark Step 7 done, and add a short section documenting the admin order conventions (direct status updates vs. RPC, the reject-nulls-slip-path requirement now fulfilled, the separate-admin-page decision now built). Step 8 (Playwright E2E test) gets its own plan when picked up next — it's the natural point to finally exercise the full lifecycle this plan just built by hand (customer places order → uploads slip → admin verifies → ships → completes) as an automated test.
