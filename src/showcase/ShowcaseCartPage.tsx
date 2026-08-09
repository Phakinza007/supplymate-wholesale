import { Link } from 'react-router-dom'
import { useCartStore, useCartSubtotal, type CartItem } from '@/core/cart/cartStore'
import { ShowcaseNotice } from '@/showcase/ShowcaseNotice'
import { WholesaleOrderSummary } from '@/showcase/WholesaleOrderSummary'

interface CartLineControlsProps {
  item: CartItem
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}

function CartLineControls({ item, onQuantityChange, onRemove }: CartLineControlsProps) {
  const minimumQuantity = item.minOrderQuantity ?? 1

  return (
    <div className="mt-4 flex items-end justify-between gap-3">
      <label className="flex flex-col gap-1 text-sm">
        จำนวน
        <input
          type="number"
          min={minimumQuantity}
          value={item.quantity}
          onChange={(event) => onQuantityChange(Number(event.target.value))}
          className="w-24 rounded-lg border bg-background px-3 py-2"
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="text-sm font-medium text-destructive hover:underline"
      >
        ลบสินค้า
      </button>
    </div>
  )
}

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
      <div>
        <p className="text-sm font-semibold text-primary">รายการที่เลือก</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">ตะกร้าสินค้า</h1>
      </div>
      <WholesaleOrderSummary
        items={items}
        subtotal={subtotal}
        renderItemControl={(item) => (
          <CartLineControls
            item={item}
            onQuantityChange={(quantity) => updateQuantity(item.productId, item.variantId, quantity)}
            onRemove={() => removeItem(item.productId, item.variantId)}
          />
        )}
      />
      <div className="flex flex-col gap-3">
        <ShowcaseNotice />
        <Link to="/checkout" className="rounded-lg bg-primary px-5 py-3 text-center font-medium text-primary-foreground">
          ไปยังการสั่งซื้อจำลอง
        </Link>
      </div>
    </section>
  )
}
