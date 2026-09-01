import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCartStore, useCartSubtotal, type CartItem } from '@/core/cart/cartStore'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { buildTierRows, nextTierUpgrade, resolveTierPrice } from '@/lib/priceTiers'
import { useProduct } from '@/core/catalog/useProduct'
import { quantityLabel, unitNoun, type PackageUnit } from '@/lib/wholesale'
import { ShoppingCart } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/PageHeader'
import { useToastStore } from '@/lib/toastStore'

export function CartPage() {
  const items = useCartStore((state) => state.items)
  const subtotal = useCartSubtotal()
  const [lineStatuses, setLineStatuses] = useState<Record<string, LineStatus>>({})
  // Base totals are reported up by each line, the same way statuses are: the
  // cart store only holds the tier-resolved price, so the discount can only be
  // named by something that has also seen the product's base price.
  const [lineBaseTotals, setLineBaseTotals] = useState<Record<string, number>>({})

  const reportLineStatus = useCallback((key: string, status: LineStatus) => {
    setLineStatuses((current) =>
      current[key] === status ? current : { ...current, [key]: status },
    )
  }, [])

  const reportLineBaseTotal = useCallback((key: string, total: number) => {
    setLineBaseTotals((current) => (current[key] === total ? current : { ...current, [key]: total }))
  }, [])

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10" data-tour="cart-summary">
        <EmptyState
          icon={<ShoppingCart />}
          title="ตะกร้าของคุณยังว่างอยู่"
          description="เลือกสินค้าจากแคตตาล็อก ระบบจะคำนวณราคาต่อหน่วยตามจำนวนที่สั่งให้อัตโนมัติ"
          action={
            <Button asChild>
              <Link to="/shop">เลือกดูสินค้า</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const checkoutBlocked = items.some(
    (item) => lineStatuses[cartLineKey(item)] !== 'available',
  )
  // Only count lines that have actually reported, so a half-loaded cart never
  // flashes a discount larger than it is.
  const baseSubtotal = items.reduce(
    (sum, item) => sum + (lineBaseTotals[cartLineKey(item)] ?? item.unitPrice * item.quantity),
    0,
  )
  const tierDiscount = Math.max(0, baseSubtotal - subtotal)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <PageHeader title="ตะกร้าสินค้า" />

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
        {items.map((item) => (
          <CartLineItem
            key={cartLineKey(item)}
            item={item}
            onStatusChange={reportLineStatus}
            onBaseTotalChange={reportLineBaseTotal}
          />
        ))}
      </ul>

      <div
        className="rounded-md border border-border bg-card px-4 py-3.5"
        data-tour="cart-summary"
        data-tour-cart-total
      >
        {tierDiscount > 0 && (
          <dl className="mb-3 flex flex-col gap-1.5 border-b border-border pb-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">ราคาฐานรวม</dt>
              <dd className="tabular-nums">{formatPrice(baseSubtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">ส่วนลดขั้นบันได</dt>
              <dd className="font-semibold text-[var(--price-per-unit)] tabular-nums">
                −{formatPrice(tierDiscount)}
              </dd>
            </div>
          </dl>
        )}
        <div className="flex items-baseline justify-between gap-4 text-lg font-bold">
          <span>ยอดรวมสินค้า</span>
          <span className="tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          ราคายังไม่รวม VAT 7% · ภาษีและค่าจัดส่งคำนวณตอนยืนยันคำสั่งซื้อ และแสดงในหน้ายืนยัน
        </p>
      </div>

      {checkoutBlocked ? (
        <>
          <Alert tone="warning" title="ยังดำเนินการต่อไม่ได้">
            มีสินค้าที่ไม่พร้อมจำหน่ายอยู่ในตะกร้า นำออกก่อนจึงจะไปหน้าชำระเงินได้
          </Alert>
          <Button size="lg" disabled>
            ไปหน้าชำระเงิน
          </Button>
        </>
      ) : (
        <Button asChild size="lg">
          <Link to="/checkout">ไปหน้าชำระเงิน</Link>
        </Button>
      )}
    </div>
  )
}

type LineStatus = 'loading' | 'available' | 'unavailable'

function cartLineKey(item: Pick<CartItem, 'productId' | 'variantId'>) {
  return `${item.productId}:${item.variantId ?? ''}`
}

function CartLineItem({
  item,
  onStatusChange,
  onBaseTotalChange,
}: {
  item: CartItem
  onStatusChange: (key: string, status: LineStatus) => void
  onBaseTotalChange: (key: string, total: number) => void
}) {
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const removeItem = useCartStore((state) => state.removeItem)
  const addItem = useCartStore((state) => state.addItem)
  const showToast = useToastStore((state) => state.show)
  const reconcileWholesale = useCartStore((state) => state.reconcileWholesale)
  const reconcilePricing = useCartStore((state) => state.reconcilePricing)
  const { data: product, isLoading, isFetching, isError } = useProduct(item.productSlug)
  const livePackageUnit = product?.package_unit as PackageUnit | undefined
  const packageUnit = livePackageUnit ?? item.packageUnit
  const minimumQuantity = product?.min_order_quantity ?? item.minOrderQuantity
  const hasWholesaleMetadata = !!packageUnit && !!minimumQuantity && minimumQuantity > 0
  const status: LineStatus = isLoading || isFetching
    ? 'loading'
    : !isError && !!product && hasWholesaleMetadata
      ? 'available'
      : 'unavailable'

  // A variant line keeps its stored price: this page does not fetch variants,
  // and a variant price_override outranks any product-level tier anyway.
  const resolvedUnitPrice =
    product && !item.variantId
      ? resolveTierPrice(Number(product.price), product.product_price_tiers ?? [], item.quantity)
      : null

  const basePrice = product ? Number(product.price) : item.unitPrice
  const tiers = product && !item.variantId ? (product.product_price_tiers ?? []) : []
  const currentRow =
    product && minimumQuantity
      ? buildTierRows(
          basePrice,
          tiers,
          minimumQuantity,
          product.units_per_package,
          item.quantity,
        ).find((row) => row.isCurrent)
      : undefined
  const upgrade = nextTierUpgrade(basePrice, tiers, item.quantity)
  const lineSavings = (basePrice - item.unitPrice) * item.quantity
  const pieces = product ? product.units_per_package * item.quantity : null

  // Local, freely-editable copy of the quantity text. Kept separate from the
  // store value so an intermediate empty/invalid string while retyping (e.g.
  // select-all then type a new multi-digit number) never round-trips through
  // `updateQuantity` as a spurious 0, and the input never snaps back mid-edit.
  const [quantityInput, setQuantityInput] = useState(String(item.quantity))

  // Re-sync when the store's quantity actually changes (e.g. a valid commit
  // from this same input, or the line being changed elsewhere).
  useEffect(() => {
    setQuantityInput(String(item.quantity))
  }, [item.quantity])

  useEffect(() => {
    onStatusChange(cartLineKey(item), status)
  }, [item, onStatusChange, status])

  useEffect(() => {
    onBaseTotalChange(cartLineKey(item), basePrice * item.quantity)
  }, [basePrice, item, onBaseTotalChange])

  useEffect(() => {
    if (
      product &&
      livePackageUnit &&
      (item.packageUnit !== livePackageUnit ||
        item.minOrderQuantity !== product.min_order_quantity)
    ) {
      reconcileWholesale(
        item.productId,
        item.variantId,
        livePackageUnit,
        product.min_order_quantity,
      )
    }
  }, [item, livePackageUnit, product, reconcileWholesale])

  useEffect(() => {
    if (resolvedUnitPrice !== null && resolvedUnitPrice !== item.unitPrice) {
      reconcilePricing(item.productId, item.variantId, resolvedUnitPrice)
    }
  }, [item, reconcilePricing, resolvedUnitPrice])

  useEffect(() => {
    if (status === 'available' && minimumQuantity && item.quantity < minimumQuantity) {
      updateQuantity(item.productId, item.variantId, minimumQuantity)
    }
  }, [item, minimumQuantity, status, updateQuantity])

  function commitIfValid(raw: string) {
    const trimmed = raw.trim()
    const parsed = Number(trimmed)
    if (trimmed !== '' && Number.isInteger(parsed) && minimumQuantity) {
      const nextQuantity = Math.max(minimumQuantity, parsed)
      setQuantityInput(String(nextQuantity))
      updateQuantity(item.productId, item.variantId, nextQuantity)
      return true
    }
    return false
  }

  return (
    <li className="flex gap-4 p-4">
      <div className="size-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
        {item.imagePath && (
          <img
            src={resolveImageUrl(item.imagePath)}
            alt={item.productName}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Link
          to={`/products/${item.productSlug}`}
          className="font-semibold underline-offset-4 hover:underline"
        >
          {item.productName}
        </Link>
        {item.variantName && (
          <span className="text-sm text-muted-foreground">{item.variantName}</span>
        )}
        <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums text-muted-foreground">
          {/* No unit *count* here on purpose: "฿1,290.00 / 1 ลัง" would collide
              with the quantity line below for anyone — a reader or a test —
              looking for "1 ลัง" on this page. */}
          <span>{formatPrice(item.unitPrice)} ต่อหน่วย</span>
          {product && item.unitPrice < Number(product.price) && (
            <Badge tone="verified">ราคาขายส่งตามจำนวน</Badge>
          )}
        </span>
        {packageUnit ? (
          <span className="text-sm tabular-nums text-muted-foreground">
            {quantityLabel(packageUnit, item.quantity)}
            {pieces !== null && ` · ${pieces.toLocaleString('th-TH')} ชิ้น`}
          </span>
        ) : (
          <span className="text-sm font-semibold text-destructive">ไม่พบข้อมูลหน่วยสั่งซื้อ</span>
        )}
        {currentRow && packageUnit && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {currentRow.savingsPct > 0
              ? `ได้ราคาขั้น ${currentRow.from}${currentRow.to === null ? '+' : `–${currentRow.to}`} ${unitNoun(packageUnit)} · ${formatPrice(currentRow.unitPrice)}`
              : 'ราคาฐาน · ยังไม่ถึงขั้นส่วนลด'}
          </span>
        )}
        {lineSavings > 0 && (
          <span className="text-sm font-semibold text-[var(--price-per-unit)] tabular-nums">
            ประหยัด {formatPrice(lineSavings)}
          </span>
        )}
        {upgrade && packageUnit && status === 'available' && (
          <span className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              เพิ่มอีก{' '}
              <strong className="font-semibold text-foreground">
                {quantityLabel(packageUnit, upgrade.unitsNeeded)}
              </strong>{' '}
              (รวม {upgrade.minQuantity}) → {formatPrice(upgrade.unitPrice)} /{' '}
              {quantityLabel(packageUnit, 1)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateQuantity(item.productId, item.variantId, upgrade.minQuantity)
              }
            >
              เพิ่มให้ครบขั้น
            </Button>
          </span>
        )}
        {status === 'loading' && (
          <span className="text-sm text-muted-foreground">กำลังตรวจสอบสินค้า…</span>
        )}
        {status === 'unavailable' && (
          <span className="text-sm font-semibold text-destructive">สินค้านี้ไม่พร้อมจำหน่ายแล้ว</span>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            aria-label={`จำนวน ${item.productName}`}
            min={minimumQuantity ?? 1}
            value={quantityInput}
            disabled={status !== 'available'}
            onChange={(e) => {
              const value = e.target.value
              setQuantityInput(value)
              // Commit integer input eagerly, clamping it to the reconciled
              // MOQ; leave an empty intermediate value as local-only state.
              commitIfValid(value)
            }}
            onBlur={(e) => {
              // If the field was left empty/invalid on blur, don't corrupt
              // state or remove the line — just revert to the last known
              // good quantity from the store.
              if (!commitIfValid(e.target.value)) {
                setQuantityInput(String(item.quantity))
              }
            }}
            className="w-20"
          />
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-destructive hover:bg-[var(--status-cancelled-bg)] sm:min-h-9"
            aria-label={`นำ ${item.productName} ออกจากตะกร้า`}
            onClick={() => {
              // Recovery beats prevention for something this cheap to restore:
              // no dialog in the way, but the line is never gone for good on a
              // mis-tap.
              const removed = { ...item }
              removeItem(item.productId, item.variantId)
              showToast({
                title: 'นำออกจากตะกร้าแล้ว',
                detail: removed.productName,
                action: {
                  label: 'เลิกทำ',
                  onClick: () => addItem(removed, removed.quantity),
                },
              })
            }}
          >
            ลบ
          </Button>
        </div>
      </div>
      <span className="shrink-0 font-semibold tabular-nums">
        {formatPrice(item.unitPrice * item.quantity)}
      </span>
    </li>
  )
}
