import { Link } from 'react-router-dom'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { formatPrice } from '@/lib/formatPrice'
import { quantityLabel } from '@/lib/wholesale'
import { ShowcaseNotice } from '@/showcase/ShowcaseNotice'

export function ShowcaseCartPage() {
  const items = useCartStore((state) => state.items)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const removeItem = useCartStore((state) => state.removeItem)
  const subtotal = useCartSubtotal()

  if (items.length === 0) {
    return (
      <section className="py-12 text-center">
        <h1 className="text-2xl font-semibold">ตะกร้าของคุณยังว่างอยู่</h1>
        <Link to="/shop" className="mt-4 inline-block rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
          เลือกสินค้า
        </Link>
      </section>
    )
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
      <h1 className="text-3xl font-semibold tracking-tight">ตะกร้าสินค้า</h1>
      <ul className="flex flex-col gap-4">
        {items.map((item) => {
          const minimumQuantity = item.minOrderQuantity ?? 1
          return (
            <li key={`${item.productId}:${item.variantId ?? ''}`} className="flex gap-4 rounded-2xl border bg-card p-4">
              {item.imagePath && (
                <img
                  src={item.imagePath}
                  alt={item.productName}
                  className="size-20 shrink-0 rounded-lg bg-muted object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Link to={`/products/${item.productSlug}`} className="font-semibold hover:underline">
                  {item.productName}
                </Link>
                <p className="text-sm text-muted-foreground">{formatPrice(item.unitPrice)} ต่อหน่วย</p>
                {item.packageUnit && (
                  <p className="text-sm text-muted-foreground">
                    {quantityLabel(item.packageUnit, item.quantity)}
                  </p>
                )}
                <div className="flex items-end justify-between gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    จำนวน
                    <input
                      type="number"
                      min={minimumQuantity}
                      value={item.quantity}
                      onChange={(event) =>
                        updateQuantity(item.productId, item.variantId, Number(event.target.value))
                      }
                      className="w-24 rounded-lg border bg-background px-3 py-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId, item.variantId)}
                    className="text-sm font-medium text-destructive hover:underline"
                  >
                    ลบสินค้า
                  </button>
                </div>
              </div>
              <p className="whitespace-nowrap font-semibold">{formatPrice(item.unitPrice * item.quantity)}</p>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between border-t pt-4 text-lg font-semibold">
        <span>ยอดรวมสินค้า</span>
        <span>{formatPrice(subtotal)}</span>
      </div>
      <div className="flex flex-col gap-3">
        <ShowcaseNotice />
        <Link to="/checkout" className="rounded-lg bg-primary px-5 py-3 text-center font-medium text-primary-foreground">
          ไปยังการสั่งซื้อจำลอง
        </Link>
      </div>
    </section>
  )
}
