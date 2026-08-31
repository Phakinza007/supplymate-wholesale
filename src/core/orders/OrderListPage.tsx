import { Link } from 'react-router-dom'
import { PackageOpen } from 'lucide-react'
import { useOrders } from '@/core/orders/useOrders'
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

export function OrderListPage() {
  const { data: orders, isLoading, isError } = useOrders()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <PageHeader
        title="คำสั่งซื้อของคุณ"
        description="ดูสถานะ แนบสลิป และติดตามเลขพัสดุของแต่ละคำสั่งซื้อ"
      />

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
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
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
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
