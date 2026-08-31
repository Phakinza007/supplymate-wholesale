import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAdminOrder } from '@/core/admin/useAdminOrder'
import { useAdminOrderMutations } from '@/core/admin/useAdminOrderMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { paymentMethodLabel } from '@/lib/paymentMethod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    refetchInterval: 45_000,
  })
}

export function AdminOrderDetailPage() {
  const { orderId } = useParams()
  const { data: order, isLoading, isError } = useAdminOrder(orderId)
  const { data: slipUrl, isError: isSlipUrlError } = useSignedSlipUrl(
    order?.payment_slip_path ?? null,
  )
  const { verifyPayment, rejectSlip, shipOrder, completeOrder, cancelOrder } =
    useAdminOrderMutations(orderId ?? '')
  const [actionError, setActionError] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [shippingCarrier, setShippingCarrier] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')

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

      <div className="flex flex-col gap-1 rounded-md border p-4 text-sm">
        <h2 className="font-medium">ข้อมูลธุรกิจผู้สั่งซื้อ</h2>
        {order.business_name ? (
          <p>{order.business_name}</p>
        ) : (
          <p className="text-muted-foreground">ไม่มีข้อมูลธุรกิจ</p>
        )}
        {order.tax_id && (
          <p className="text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {order.tax_id}</p>
        )}
        {order.branch_name && <p className="text-muted-foreground">สาขา: {order.branch_name}</p>}
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
              {item.product_name}
              {item.variant_name ? ` (${item.variant_name})` : ''} × {item.quantity}
            </span>
            <span>{formatPrice(item.line_total ?? item.unit_price * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        {order.discount_total > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount{order.promo_code ? ` (${order.promo_code})` : ''}</span>
            <span>-{formatPrice(order.discount_total)}</span>
          </div>
        )}
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
        {/* Which method the buyer chose. It does not change how the slip is
            verified — both end in the same manual check — but it tells the
            shop which account to reconcile the transfer against. */}
        <p className="text-sm text-muted-foreground">
          วิธีที่ผู้ซื้อเลือก: {paymentMethodLabel(order.payment_method)}
        </p>
        {!order.payment_slip_path ? (
          <p className="text-sm text-muted-foreground">No payment slip uploaded yet.</p>
        ) : isSlipUrlError ? (
          <p className="text-sm text-destructive">Failed to load payment slip.</p>
        ) : slipUrl ? (
          <a
            href={slipUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline"
          >
            View payment slip →
          </a>
        ) : null}
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="rejection-reason">เหตุผลที่ให้แนบสลิปใหม่</Label>
            <Input
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={!rejectionReason.trim() || rejectSlip.isPending}
              onClick={async () => {
                setActionError(null)
                try {
                  await rejectSlip.mutateAsync({ reason: rejectionReason })
                  setRejectionReason('')
                } catch (err) {
                  setActionError(getErrorMessage(err, 'Failed to reject slip.'))
                }
              }}
            >
              {rejectSlip.isPending ? 'Rejecting…' : 'Reject slip (request re-upload)'}
            </Button>
          </div>
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
    </div>
  )
}
