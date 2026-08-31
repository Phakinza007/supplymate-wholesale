import { Link } from 'react-router-dom'
import { useCartStore, useCartSubtotal, type CartItem } from '@/core/cart/cartStore'
import { QuantityStepper } from '@/showcase/QuantityStepper'
import { WholesaleOrderSummary } from '@/showcase/WholesaleOrderSummary'

interface CartLineControlsProps {
  item: CartItem
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}

function CartLineControls({ item, onQuantityChange, onRemove }: CartLineControlsProps) {
  const minimumQuantity = item.minOrderQuantity ?? 1

  return (
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
      {item.packageUnit ? (
        <QuantityStepper
          value={item.quantity}
          min={minimumQuantity}
          onChange={onQuantityChange}
          packageUnit={item.packageUnit}
          context={item.productName}
        />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          จำนวน {item.productName}
          <input
            type="number"
            min={minimumQuantity}
            value={item.quantity}
            onChange={(event) => onQuantityChange(Number(event.target.value))}
            className="w-24 rounded-lg border bg-background px-3 py-2"
          />
        </label>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`ลบ ${item.productName} ออกจากตะกร้า`}
        className="min-h-11 text-sm font-semibold text-destructive hover:underline"
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
        <h1 className="showcase-page-title">ตะกร้าของคุณยังว่างอยู่</h1>
        <Link to="/shop" className="showcase-button showcase-button--primary mt-6">
          เลือกสินค้า
        </Link>
      </section>
    )
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
      <div>
        <p className="showcase-eyebrow">รายการที่เลือก</p>
        <h1 className="showcase-page-title">ตะกร้าสินค้า</h1>
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
      {/* The standing notice at the top of every page already carries the
          disclosure — this page repeats only the part that applies to the next
          step. */}
      <div className="flex flex-col gap-3">
        <Link
          to="/checkout"
          className="showcase-button showcase-button--primary showcase-button--block"
        >
          ไปยังการสั่งซื้อจำลอง
        </Link>
        <p className="showcase-commit-caption">ขั้นตอนถัดไปเป็นการจำลอง ไม่มีการส่งคำสั่งซื้อจริง</p>
      </div>
    </section>
  )
}
