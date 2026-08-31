import type { ReactNode } from 'react'
import type { CartItem } from '@/core/cart/cartStore'
import { formatPrice } from '@/lib/formatPrice'
import { quantityLabel } from '@/lib/wholesale'

interface WholesaleOrderSummaryProps {
  items: CartItem[]
  subtotal: number
  renderItemControl?: (item: CartItem) => ReactNode
}

export function WholesaleOrderSummary({ items, subtotal, renderItemControl }: WholesaleOrderSummaryProps) {
  return (
    <section className="wholesale-order-summary" aria-labelledby="wholesale-order-summary-title">
      <h2 id="wholesale-order-summary-title">สรุปรายการสั่งซื้อ</h2>
      <ul className="wholesale-order-summary__items">
        {items.map((item) => (
          <li key={`${item.productId}:${item.variantId ?? ''}`} className="wholesale-order-summary__item">
            <div className="wholesale-order-summary__line">
              <div>
                <p className="wholesale-order-summary__name">{item.productName}</p>
                {item.variantName && <p className="wholesale-order-summary__variant">{item.variantName}</p>}
                {/* The editable cart renders a stepper that already states the
                    live quantity — only the read-only summary needs this line. */}
                {!renderItemControl && (
                  <p className="wholesale-order-summary__quantity">
                    {item.packageUnit ? quantityLabel(item.packageUnit, item.quantity) : `${item.quantity.toLocaleString('th-TH')} รายการ`}
                  </p>
                )}
              </div>
              <p className="wholesale-order-summary__line-total">{formatPrice(item.unitPrice * item.quantity)}</p>
            </div>
            {renderItemControl?.(item)}
          </li>
        ))}
      </ul>
      <dl className="wholesale-order-summary__subtotal">
        <div>
          <dt>ยอดรวมสินค้า</dt>
          <dd>{formatPrice(subtotal)}</dd>
        </div>
      </dl>
    </section>
  )
}
