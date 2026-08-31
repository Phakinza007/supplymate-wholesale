import { Link, useSearchParams } from 'react-router-dom'
import { useAdminOrders, ORDER_STATUSES, type OrderStatus } from '@/core/admin/useAdminOrders'
import { formatPrice } from '@/lib/formatPrice'
import { orderStatusLabel, orderStatusTone } from '@/lib/orderStatus'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'

const CHIP = 'min-h-11 rounded-full border border-border px-3 text-sm font-semibold transition-colors sm:min-h-9'

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

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 md:px-0">
      <PageHeader title="คำสั่งซื้อ" description="ตรวจสลิป ยืนยันการชำระเงิน และบันทึกการจัดส่ง" />

      <div role="group" aria-label="กรองตามสถานะ" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!statusFilter}
          onClick={() => setStatus(undefined)}
          className={cn(CHIP, !statusFilter ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
        >
          ทั้งหมด
        </button>
        {ORDER_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statusFilter === status}
            onClick={() => setStatus(status)}
            className={cn(
              CHIP,
              statusFilter === status
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent',
            )}
          >
            {orderStatusLabel(status, 'short')}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {/* Never let a failed load read as "no orders": an owner acting on that
          could tell a waiting customer their order never arrived. */}
      {isError && (
        <Alert tone="error" title="โหลดคำสั่งซื้อไม่สำเร็จ">
          ลองรีเฟรชอีกครั้ง รายการนี้ไม่ใช่คำสั่งซื้อทั้งหมดที่มี
        </Alert>
      )}

      {!isLoading && !isError && orders?.length === 0 && (
        <EmptyState
          title={statusFilter ? 'ไม่มีคำสั่งซื้อในสถานะนี้' : 'ยังไม่มีคำสั่งซื้อ'}
          description={
            statusFilter
              ? 'ลองเลือกสถานะอื่น หรือดูทั้งหมด'
              : 'คำสั่งซื้อจากหน้าร้านจะมาปรากฏที่นี่พร้อมสลิปการโอน'
          }
        />
      )}

      {!isLoading && !isError && orders && orders.length > 0 && (
        <Table stickyHeader className="min-w-[40rem]">
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่</TableHead>
              <TableHead>ลูกค้า</TableHead>
              <TableHead>วันที่</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead numeric>ยอดรวม</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link
                    to={`/admin/orders/${order.id}`}
                    className="font-mono text-xs font-semibold underline-offset-4 hover:underline"
                  >
                    {order.order_number}
                  </Link>
                </TableCell>
                <TableCell>{order.customer_name}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </TableCell>
                <TableCell>
                  <Badge tone={orderStatusTone(order.status)}>
                    {orderStatusLabel(order.status, 'short')}
                  </Badge>
                </TableCell>
                <TableCell numeric>{formatPrice(order.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
