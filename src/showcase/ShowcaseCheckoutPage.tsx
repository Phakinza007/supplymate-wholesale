import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useCartStore, useCartSubtotal, type CartItem } from '@/core/cart/cartStore'
import { WholesaleOrderSummary } from '@/showcase/WholesaleOrderSummary'

interface Confirmation {
  reference: string
  items: CartItem[]
  subtotal: number
}

export function ShowcaseCheckoutPage() {
  const items = useCartStore((state) => state.items)
  const clearCart = useCartStore((state) => state.clear)
  const subtotal = useCartSubtotal()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  if (confirmation) {
    return (
      <section className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
        <div className="rounded-2xl border bg-card p-6 text-center sm:p-8">
          <p className="showcase-eyebrow">เลขอ้างอิง {confirmation.reference}</p>
          <h1 className="showcase-page-title">บันทึกการสาธิตแล้ว</h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            ไม่มีการส่งหรือบันทึกคำสั่งซื้อ การชำระเงิน หรือข้อมูลลูกค้า
          </p>
        </div>
        <WholesaleOrderSummary items={confirmation.items} subtotal={confirmation.subtotal} />
        <Link
          to="/shop"
          className="showcase-button showcase-button--primary showcase-button--block"
        >
          กลับไปดูสินค้า
        </Link>
      </section>
    )
  }

  if (items.length === 0) return <Navigate to="/cart" replace />

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
      <div>
        <p className="showcase-eyebrow">สรุปรายการ</p>
        <h1 className="showcase-page-title">ยืนยันการสั่งซื้อจำลอง</h1>
      </div>
      <WholesaleOrderSummary items={items} subtotal={subtotal} />
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            setConfirmation({
              reference: `SM-${String(Date.now()).slice(-6)}`,
              items,
              subtotal,
            })
            clearCart()
          }}
          className="showcase-button showcase-button--primary showcase-button--block"
        >
          ยืนยันคำสั่งซื้อจำลอง
        </button>
        {/* Point of commit: the standing notice carries the full disclosure, this
            restates only what the button itself does. */}
        <p className="showcase-commit-caption">
          การกดยืนยันจะไม่ส่งคำสั่งซื้อ ไม่เก็บข้อมูล และไม่มีการชำระเงินจริง
        </p>
      </div>
    </section>
  )
}
