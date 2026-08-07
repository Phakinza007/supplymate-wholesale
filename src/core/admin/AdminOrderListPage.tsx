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
      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-destructive">Failed to load orders.</p>}
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
