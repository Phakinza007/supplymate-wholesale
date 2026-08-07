import { useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import { formatPrice } from '@/lib/formatPrice'
import { brandConfig } from '@/config/branding.config'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Feature } from '@/lib/Feature'

const MAX_SLIP_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_SLIP_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'
const orderStatusLabel = {
  pending: 'รอตรวจสอบการชำระเงิน',
  verified: 'ตรวจสอบการชำระเงินแล้ว',
  shipped: 'จัดส่งแล้ว',
  done: 'คำสั่งซื้อเสร็จสมบูรณ์',
  cancelled: 'ยกเลิกคำสั่งซื้อ',
} as const

function useOrder(orderId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['order', userId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId!)
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!orderId && !!userId,
    retry: false,
  })
}

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError } = useOrder(orderId, user?.id)
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
      queryClient.invalidateQueries({ queryKey: ['order', user?.id, orderId] })
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
      <p className="text-sm text-muted-foreground">
        สถานะ:{' '}
        <span>
          {orderStatusLabel[order.status as keyof typeof orderStatusLabel] ?? order.status}
        </span>
      </p>

      {order.business_name && (
        <div className="flex flex-col gap-1 rounded-md border p-4 text-sm">
          <h2 className="font-medium">ข้อมูลธุรกิจ</h2>
          <p>{order.business_name}</p>
          {order.tax_id && (
            <p className="text-muted-foreground">เลขประจำตัวผู้เสียภาษี: {order.tax_id}</p>
          )}
          {order.branch_name && <p className="text-muted-foreground">สาขา: {order.branch_name}</p>}
        </div>
      )}

      {order.shipping_carrier && order.tracking_number && (
        <div className="text-sm">
          <h2 className="font-medium">ข้อมูลจัดส่ง</h2>
          <p className="text-muted-foreground">
            {order.shipping_carrier} · {order.tracking_number}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-y py-4">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span>
              {item.product_name}
              {item.variant_name ? ` (${item.variant_name})` : ''} × {item.quantity}
              {order.status === 'done' && item.product_slug && (
                <Feature flag="reviews">
                  {' · '}
                  <Link
                    to={`/products/${item.product_slug}?review=1`}
                    className="text-primary underline"
                  >
                    Write a review
                  </Link>
                </Feature>
              )}
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

      {order.status === 'pending' && !order.payment_slip_path && (
        <div className="flex flex-col gap-3">
          {order.payment_rejection_reason && (
            <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
              <p className="font-medium">กรุณาแนบสลิปใหม่</p>
              <p>{order.payment_rejection_reason}</p>
            </div>
          )}
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

      {order.status === 'cancelled' && order.cancel_reason && (
        <p className="text-sm text-muted-foreground">เหตุผลที่ยกเลิก: {order.cancel_reason}</p>
      )}
    </div>
  )
}
