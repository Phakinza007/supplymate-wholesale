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
