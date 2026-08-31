import { useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import { formatPrice } from '@/lib/formatPrice'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { orderStatusLabel, orderStatusTone } from '@/lib/orderStatus'
import { brandConfig } from '@/config/branding.config'
import { Feature } from '@/lib/Feature'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'

const MAX_SLIP_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_SLIP_TYPES = 'image/jpeg,image/png,image/webp,application/pdf'

function useOrder(orderId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['order', userId, orderId],
    queryFn: async () => {
      // `orders` RLS ORs `user_id = auth.uid()` with is_admin(), so the
      // user_id filter is load-bearing, not redundant — see CLAUDE.md.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="px-4 py-3.5 text-sm">{children}</div>
    </section>
  )
}

function MoneyRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
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

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: order, isLoading, isError } = useOrder(orderId, user?.id)
  const [file, setFile] = useState<File | null>(null)

  const uploadSlip = useMutation({
    mutationFn: async () => {
      if (!file || !user || !order) throw new Error('Missing file')
      if (file.size > MAX_SLIP_SIZE_BYTES) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 5MB')
      const ext = file.name.split('.').pop() ?? 'jpg'
      // The caller's own id must be the first path segment: storage RLS and
      // attach_payment_slip() both reject anything else.
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

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <Alert tone="error" title="ไม่พบคำสั่งซื้อนี้">
          คำสั่งซื้ออาจถูกลบ หรือไม่ได้อยู่ในบัญชีนี้{' '}
          <Link to="/orders" className="font-semibold underline underline-offset-4">
            กลับไปหน้ารายการคำสั่งซื้อ
          </Link>
        </Alert>
      </div>
    )
  }

  const isPromptPay = order.payment_method === 'promptpay'
  const isCod = order.payment_method === 'cod'

  return (
    <div className="animate-in fade-in duration-150 motion-reduce:animate-none mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-10">
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

      {order.status === 'cancelled' && order.cancel_reason && (
        <Alert tone="warning" title="คำสั่งซื้อถูกยกเลิก">{order.cancel_reason}</Alert>
      )}

      {order.business_name && (
        <Section title="ข้อมูลธุรกิจ">
          <p className="font-semibold">{order.business_name}</p>
          {order.tax_id && (
            <p className="mt-1 text-muted-foreground">
              เลขประจำตัวผู้เสียภาษี <span className="font-mono">{order.tax_id}</span>
            </p>
          )}
          {order.branch_name && <p className="text-muted-foreground">สาขา: {order.branch_name}</p>}
        </Section>
      )}

      {order.shipping_carrier && order.tracking_number && (
        <Section title="ข้อมูลจัดส่ง">
          <p className="font-mono">
            {order.shipping_carrier} · {order.tracking_number}
          </p>
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
                {order.status === 'done' && item.product_slug && (
                  <Feature flag="reviews">
                    {' · '}
                    <Link
                      to={`/products/${item.product_slug}?review=1`}
                      className="font-semibold text-signal underline-offset-4 hover:underline"
                    >
                      เขียนรีวิว
                    </Link>
                  </Feature>
                )}
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
          {/* Catalogue prices are VAT-exclusive, so the tax is a line of its
              own rather than something folded into the prices above. */}
          {order.vat_total > 0 && (
            <MoneyRow label="ภาษีมูลค่าเพิ่ม 7%" value={formatPrice(order.vat_total)} />
          )}
          <MoneyRow label="ยอดรวมทั้งสิ้น" value={formatPrice(order.total)} strong />
        </div>
      </Section>

      {order.status === 'pending' && isCod && (
        <Section title="ชำระเงินปลายทาง">
          <p className="text-sm">
            จ่ายเงินสด{' '}
            <strong className="tabular-nums">{formatPrice(order.total)}</strong>{' '}
            กับพนักงานขนส่งตอนรับของ ไม่ต้องโอนหรือแนบสลิปล่วงหน้า
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            ยอดนี้รวมค่าบริการเก็บเงินปลายทาง {formatPrice(order.cod_fee)} แล้ว
            ทางร้านจะติดต่อยืนยันก่อนจัดส่ง
          </p>
        </Section>
      )}

      {order.status === 'pending' && !isCod && !order.payment_slip_path && (
        <Section
          title={isPromptPay ? 'ชำระเงินด้วยพร้อมเพย์' : 'ชำระเงินด้วยการโอน'}
        >
          {order.payment_rejection_reason && (
            <Alert tone="warning" title="กรุณาแนบสลิปใหม่" className="mb-3.5">
              {order.payment_rejection_reason}
            </Alert>
          )}
          {isPromptPay ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={brandConfig.promptPay.qrImageUrl}
                alt="QR พร้อมเพย์ของร้าน"
                width={200}
                height={200}
                className="rounded-md border border-border bg-white"
              />
              {/* The QR is static — it carries no amount — so the amount has to
                  be stated beside it, and the buyer types it in themselves. */}
              <dl className="flex w-full flex-col gap-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">ชื่อบัญชี</dt>
                  <dd>{brandConfig.promptPay.accountName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">พร้อมเพย์</dt>
                  <dd className="font-mono">{brandConfig.promptPay.promptPayId}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-semibold">
                  <dt>ยอดที่ต้องโอน</dt>
                  <dd className="tabular-nums">{formatPrice(order.total)}</dd>
                </div>
              </dl>
              <Alert tone="info" title="QR นี้ไม่ได้ผูกยอด" className="w-full">
                กรุณากรอกยอด {formatPrice(order.total)} เองในแอปธนาคาร แล้วแนบสลิปด้านล่าง
              </Alert>
            </div>
          ) : (
            <dl className="flex flex-col gap-1">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">ธนาคาร</dt>
                <dd>{brandConfig.bankTransfer.bankName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">ชื่อบัญชี</dt>
                <dd>{brandConfig.bankTransfer.accountName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">เลขที่บัญชี</dt>
                <dd className="font-mono">{brandConfig.bankTransfer.accountNumber}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-semibold">
                <dt>ยอดที่ต้องโอน</dt>
                <dd className="tabular-nums">{formatPrice(order.total)}</dd>
              </div>
            </dl>
          )}
          <div className="mt-4 flex flex-col gap-3">
            <input
              type="file"
              accept={ACCEPTED_SLIP_TYPES}
              onChange={handleFileChange}
              aria-label="เลือกไฟล์สลิปการโอน"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
            {uploadSlip.isError && (
              <Alert tone="error" title="แนบสลิปไม่สำเร็จ">
                {getErrorMessage(uploadSlip.error, 'ลองใหม่อีกครั้ง')}
              </Alert>
            )}
            <Button
              disabled={!file}
              loading={uploadSlip.isPending}
              onClick={() => uploadSlip.mutate()}
            >
              {uploadSlip.isPending ? 'กำลังอัปโหลด' : 'แนบสลิปการโอน'}
            </Button>
          </div>
        </Section>
      )}

      {order.status === 'pending' && order.payment_slip_path && (
        <Alert tone="info" title="ได้รับสลิปแล้ว">กำลังตรวจสอบการชำระเงิน จะแจ้งผลให้ทราบอีกครั้ง</Alert>
      )}
    </div>
  )
}
