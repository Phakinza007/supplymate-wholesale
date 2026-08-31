import { Link } from 'react-router-dom'
import { PackageOpen } from 'lucide-react'
import { useState } from 'react'
import { useOrders } from '@/core/orders/useOrders'
import { useReorder } from '@/core/orders/useReorder'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { paymentMethodLabel } from '@/lib/paymentMethod'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/formatPrice'
import { orderStatusLabel, orderStatusTone } from '@/lib/orderStatus'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'

function OrderListSkeleton() {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-4 w-20" />
        </li>
      ))}
    </ul>
  )
}

// 'open' leads: orders still waiting on the buyer or the shop. Done and
// cancelled ones are history and only pad the list.
type OrderFilter = 'open' | 'all' | 'pending' | 'shipped'

const FILTERS: { key: OrderFilter; label: string; match: (status: string) => boolean }[] = [
  { key: 'open', label: 'กำลังดำเนินการ', match: (s) => s !== 'done' && s !== 'cancelled' },
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'pending', label: 'รอชำระ', match: (s) => s === 'pending' },
  { key: 'shipped', label: 'กำลังส่ง', match: (s) => s === 'shipped' },
]

const FILTER_CHIP = 'rounded-md border px-3 py-2 text-xs font-medium tabular-nums transition-colors'

export function OrderListPage() {
  const { data: orders, isLoading, isError } = useOrders()
  const reorder = useReorder()
  const [filter, setFilter] = useState<OrderFilter>('open')
  const [notice, setNotice] = useState<string | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)

  const matcher = FILTERS.find((f) => f.key === filter)!.match
  const visible = (orders ?? []).filter((order) => matcher(order.status))
  const lifetimeTotal = (orders ?? []).reduce((sum, order) => sum + Number(order.total), 0)

  async function handleReorder(orderId: string) {
    setNotice(null)
    setReorderError(null)
    setReorderingId(orderId)
    try {
      const result = await reorder.mutateAsync(orderId)
      if (result.added === 0) {
        setReorderError('ไม่มีรายการใดในบิลนี้ที่สั่งซ้ำได้')
        return
      }
      const skipped =
        result.skipped.length > 0
          ? ` ข้าม ${result.skipped.length} รายการ: ${result.skipped
              .map((line) => `${line.name} (${line.reason})`)
              .join(', ')}`
          : ''
      setNotice(`เพิ่มลงตะกร้าแล้ว ${result.added} รายการ.${skipped}`)
    } catch (err) {
      setReorderError(getErrorMessage(err, 'สั่งซ้ำไม่สำเร็จ'))
    } finally {
      setReorderingId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <PageHeader
        title="คำสั่งซื้อของคุณ"
        description="ดูสถานะ แนบสลิป และติดตามเลขพัสดุของแต่ละคำสั่งซื้อ"
      />

      {orders && orders.length > 0 && (
        <>
          <p className="-mt-2 text-sm text-muted-foreground tabular-nums">
            {orders.length} บิล · ยอดรวม {formatPrice(lifetimeTotal)}
          </p>
          <div role="group" aria-label="กรองคำสั่งซื้อ" className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={filter === option.key}
                onClick={() => setFilter(option.key)}
                className={cn(
                  FILTER_CHIP,
                  filter === option.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {option.label} {orders.filter((order) => option.match(order.status)).length}
              </button>
            ))}
          </div>
        </>
      )}

      {notice && (
        <Alert tone="success" title="สั่งซ้ำแล้ว">
          {notice}{' '}
          <Link to="/cart" className="font-semibold underline">
            ไปที่ตะกร้า
          </Link>
        </Alert>
      )}
      {reorderError && (
        <Alert tone="error" title="สั่งซ้ำไม่สำเร็จ">
          {reorderError}
        </Alert>
      )}

      {isLoading && <OrderListSkeleton />}

      {/* A failed load must never look like "no orders yet" — that is the one
          mistake that makes a buyer place the same order twice. */}
      {isError && (
        <Alert tone="error" title="โหลดคำสั่งซื้อไม่สำเร็จ">
          ลองรีเฟรชหน้านี้อีกครั้ง ถ้ายังไม่ได้แปลว่าเชื่อมต่อไม่สำเร็จ ไม่ใช่ว่าคุณไม่มีคำสั่งซื้อ
        </Alert>
      )}

      {!isLoading && !isError && orders?.length === 0 && (
        <EmptyState
          icon={<PackageOpen />}
          title="ยังไม่มีคำสั่งซื้อ"
          description="เมื่อสั่งซื้อแล้ว รายการจะมาอยู่ที่นี่ พร้อมสถานะการชำระเงินและเลขพัสดุ"
          action={
            <Button asChild>
              <Link to="/shop">เลือกดูสินค้า</Link>
            </Button>
          }
        />
      )}

      {!isLoading && !isError && orders && orders.length > 0 && (
        <ul className="animate-in fade-in duration-150 motion-reduce:animate-none flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {visible.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5"
            >
              {/* The row's link and its reorder button are siblings: a button
                  nested in an anchor is invalid and unreachable by keyboard. */}
              <Link to={`/orders/${order.id}`} className="min-w-0 flex-1 rounded-sm hover:underline">
                <p className="font-mono text-xs text-muted-foreground">#{order.order_number}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={orderStatusTone(order.status)}>
                    {orderStatusLabel(order.status, 'short')}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    · {order.order_items?.[0]?.count ?? 0} รายการ ·{' '}
                    {paymentMethodLabel(order.payment_method)}
                  </span>
                </p>
              </Link>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reorder.isPending}
                  onClick={() => handleReorder(order.id)}
                >
                  {reorderingId === order.id ? 'กำลังเพิ่ม…' : 'สั่งซ้ำทั้งบิล'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
