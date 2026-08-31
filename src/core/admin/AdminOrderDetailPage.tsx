import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAdminOrder } from '@/core/admin/useAdminOrder'
import { useAdminOrderMutations } from '@/core/admin/useAdminOrderMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { paymentMethodLabel } from '@/lib/paymentMethod'
import { orderStatusLabel, orderStatusTone } from '@/lib/orderStatus'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'

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
    // A 60-second URL goes stale while the owner is still reading the order;
    // refresh it before they click.
    refetchInterval: 45_000,
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="px-4 py-3.5 text-sm">{children}</div>
    </section>
  )
}

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? 'flex items-baseline justify-between gap-4 border-t border-border pt-2.5 font-semibold'
          : 'flex items-baseline justify-between gap-4 text-muted-foreground'
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 px-4 pb-8 md:px-0">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="px-4 pb-8 md:px-0">
        <Alert tone="error" title="ไม่พบคำสั่งซื้อนี้">ลิงก์อาจไม่ถูกต้อง หรือคำสั่งซื้อถูกลบไปแล้ว</Alert>
      </div>
    )
  }

  const address = order.shipping_address as {
    recipient_name?: string
    phone?: string
    line1?: string
    line2?: string
    province?: string
    postal_code?: string
  } | null

  return (
    <div className="flex flex-col gap-5 px-4 pb-8 md:px-0">
      <PageHeader
        title={
          <>
            คำสั่งซื้อ <span className="font-mono">#{order.order_number}</span>
          </>
        }
        action={
          <Badge tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
        }
      />

      {actionError && <Alert tone="error" title="ดำเนินการไม่สำเร็จ">{actionError}</Alert>}

      <Section title="ลูกค้า">
        <p className="font-semibold">{order.customer_name}</p>
        <p className="font-mono text-muted-foreground">{order.customer_phone}</p>
        {order.customer_email && <p className="text-muted-foreground">{order.customer_email}</p>}
        {order.customer_note && (
          <p className="mt-1.5 text-muted-foreground">หมายเหตุ: {order.customer_note}</p>
        )}
      </Section>

      <Section title="ข้อมูลธุรกิจผู้สั่งซื้อ">
        {order.business_name ? (
          <p className="font-semibold">{order.business_name}</p>
        ) : (
          <p className="text-muted-foreground">ไม่มีข้อมูลธุรกิจ</p>
        )}
        {order.tax_id && (
          <p className="mt-1 text-muted-foreground">
            เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{order.tax_id}</span>
          </p>
        )}
        {order.branch_name && <p className="text-muted-foreground">สาขา: {order.branch_name}</p>}
      </Section>

      {address && (
        <Section title="ที่อยู่จัดส่ง">
          <p className="font-semibold">{address.recipient_name}</p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}, {address.province} {address.postal_code}
          </p>
          <p className="font-mono text-muted-foreground">{address.phone}</p>
        </Section>
      )}

      <Section title="รายการสินค้า">
        <ul className="flex flex-col gap-2.5">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4">
              <span>
                {item.product_name}
                {item.variant_name ? ` (${item.variant_name})` : ''}
                <span className="text-muted-foreground"> × {item.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatPrice(item.line_total ?? item.unit_price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <MoneyRow label="ยอดรวมสินค้า" value={formatPrice(order.subtotal)} />
          {order.discount_total > 0 && (
            <MoneyRow
              label={`ส่วนลด${order.promo_code ? ` (${order.promo_code})` : ''}`}
              value={`-${formatPrice(order.discount_total)}`}
            />
          )}
          <MoneyRow label="ค่าจัดส่ง" value={formatPrice(order.shipping_fee)} />
          {order.cod_fee > 0 && (
            <MoneyRow label="ค่าบริการเก็บเงินปลายทาง" value={formatPrice(order.cod_fee)} />
          )}
          {order.vat_total > 0 && (
            <MoneyRow label="ภาษีมูลค่าเพิ่ม 7%" value={formatPrice(order.vat_total)} />
          )}
          <MoneyRow label="ยอดรวมทั้งสิ้น" value={formatPrice(order.total)} strong />
        </div>
      </Section>

      <Section title="สลิปการโอน">
        {/* Which method the buyer chose. It does not change how the slip is
            verified — both end in the same manual check — but it tells the
            shop which account to reconcile the transfer against. */}
        <p className="text-muted-foreground">
          วิธีที่ผู้ซื้อเลือก: {paymentMethodLabel(order.payment_method)}
        </p>
        {order.payment_method === 'cod' && (
          <Alert tone="warning" title="เก็บเงินปลายทาง — ไม่มีสลิปให้ตรวจ">
            เงินเก็บตอนส่งของ กดยืนยันเมื่อตรวจแล้วว่าที่อยู่ส่งได้จริงและของพร้อมส่ง —
            พัสดุ COD ที่ถูกปฏิเสธปลายทาง ร้านรับภาระค่าส่งกลับเอง
          </Alert>
        )}
        <div className="mt-2">
          {!order.payment_slip_path ? (
            <p className="text-muted-foreground">ยังไม่ได้แนบสลิป</p>
          ) : isSlipUrlError ? (
            // Deliberately distinct from "no slip": conflating a fetch failure
            // with an unpaid order is exactly the wrong way to be wrong next to
            // a reject button.
            <Alert tone="error" title="โหลดสลิปไม่สำเร็จ">
              ยังตัดสินใจจากสลิปนี้ไม่ได้ — ลองรีเฟรชก่อน อย่าเพิ่งปฏิเสธ
            </Alert>
          ) : slipUrl ? (
            <a
              href={slipUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-semibold text-signal underline underline-offset-4"
            >
              เปิดสลิป →
            </a>
          ) : null}
        </div>
        {order.payment_note && (
          <p className="mt-1.5 text-muted-foreground">หมายเหตุ: {order.payment_note}</p>
        )}
      </Section>

      {order.tracking_number && (
        <Section title="การจัดส่ง">
          <p className="font-mono">
            {order.shipping_carrier} · {order.tracking_number}
          </p>
        </Section>
      )}

      {order.order_status_history.length > 0 && (
        <Section title="ประวัติสถานะ">
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {order.order_status_history.map((entry) => (
              <li key={entry.id} className="tabular-nums">
                {new Date(entry.created_at).toLocaleString('th-TH')} —{' '}
                {entry.from_status ? orderStatusLabel(entry.from_status, 'short') : 'สร้างคำสั่งซื้อ'}{' '}
                → {orderStatusLabel(entry.to_status, 'short')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {order.status === 'pending' && (
        <Button
          disabled={!order.payment_slip_path}
          loading={verifyPayment.isPending}
          onClick={async () => {
            setActionError(null)
            try {
              await verifyPayment.mutateAsync()
            } catch (err) {
              setActionError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
            }
          }}
        >
          {verifyPayment.isPending ? 'กำลังยืนยัน' : 'ยืนยันการชำระเงิน'}
        </Button>
      )}

      {order.status === 'verified' && (
        <div className="flex flex-col gap-4">
          <Section title="บันทึกการจัดส่ง">
            <div className="flex flex-col gap-4">
              <Field label="เลขพัสดุ">
                <Input
                  id="tracking"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </Field>
              <Field label="ขนส่ง">
                <Input
                  id="carrier"
                  value={shippingCarrier}
                  onChange={(e) => setShippingCarrier(e.target.value)}
                />
              </Field>
              <Button
                className="self-start"
                loading={shipOrder.isPending}
                onClick={async () => {
                  setActionError(null)
                  try {
                    await shipOrder.mutateAsync({
                      tracking_number: trackingNumber || undefined,
                      shipping_carrier: shippingCarrier || undefined,
                    })
                  } catch (err) {
                    setActionError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
                  }
                }}
              >
                {shipOrder.isPending ? 'กำลังบันทึก' : 'บันทึกการจัดส่ง'}
              </Button>
            </div>
          </Section>

          <Section title="ขอให้แนบสลิปใหม่">
            <div className="flex flex-col gap-4">
              <Field
                label="เหตุผลที่ให้แนบสลิปใหม่"
                hint="ลูกค้าจะเห็นข้อความนี้ในหน้าคำสั่งซื้อของเขา"
              >
                <Input
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </Field>
              <Button
                variant="outline"
                className="self-start"
                disabled={!rejectionReason.trim()}
                loading={rejectSlip.isPending}
                onClick={async () => {
                  setActionError(null)
                  try {
                    await rejectSlip.mutateAsync({ reason: rejectionReason })
                    setRejectionReason('')
                  } catch (err) {
                    setActionError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
                  }
                }}
              >
                {rejectSlip.isPending ? 'กำลังส่งคำขอ' : 'ปฏิเสธสลิป'}
              </Button>
            </div>
          </Section>
        </div>
      )}

      {order.status === 'shipped' && (
        <Button
          loading={completeOrder.isPending}
          onClick={async () => {
            setActionError(null)
            try {
              await completeOrder.mutateAsync()
            } catch (err) {
              setActionError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
            }
          }}
        >
          {completeOrder.isPending ? 'กำลังบันทึก' : 'ปิดคำสั่งซื้อ'}
        </Button>
      )}

      {(order.status === 'pending' || order.status === 'verified' || order.status === 'shipped') && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {!showCancelForm ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 self-start text-destructive hover:bg-[var(--status-cancelled-bg)] sm:min-h-9"
              onClick={() => setShowCancelForm(true)}
            >
              ยกเลิกคำสั่งซื้อ
            </Button>
          ) : (
            <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
              <Field label="เหตุผลที่ยกเลิก" hint="ลูกค้าจะเห็นเหตุผลนี้" required>
                <Input
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  disabled={!cancelReason}
                  loading={cancelOrder.isPending}
                  onClick={async () => {
                    setActionError(null)
                    try {
                      await cancelOrder.mutateAsync(cancelReason)
                      setShowCancelForm(false)
                    } catch (err) {
                      setActionError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
                    }
                  }}
                >
                  {cancelOrder.isPending ? 'กำลังยกเลิก' : 'ยืนยันการยกเลิก'}
                </Button>
                <Button variant="outline" onClick={() => setShowCancelForm(false)}>
                  ไม่ยกเลิกแล้ว
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Only when there is something the badge in the header does not already
          say. Repeating the status word for word under it is noise. */}
      {order.status === 'cancelled' && order.cancel_reason && (
        <Alert tone="warning" title="เหตุผลที่ยกเลิก">{order.cancel_reason}</Alert>
      )}
    </div>
  )
}
