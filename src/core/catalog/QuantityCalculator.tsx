import { formatPrice } from '@/lib/formatPrice'
import { quantityLabel, unitNoun, type PackageUnit } from '@/lib/wholesale'
import { cn } from '@/lib/utils'

// Does the arithmetic a wholesale buyer would otherwise do on paper: how many
// pieces that quantity really is, which tier price it lands on, and what the
// line comes to. Shown live while the quantity changes, because the tier price
// moving under you is the whole point of a ladder.
export function QuantityCalculator({
  quantity,
  onQuantityChange,
  minQuantity,
  maxQuantity,
  packageUnit,
  unitsPerPackage,
  unitPrice,
  basePrice,
  disabled = false,
}: {
  quantity: number
  onQuantityChange: (next: number) => void
  minQuantity: number
  maxQuantity: number
  packageUnit: PackageUnit
  unitsPerPackage: number
  unitPrice: number
  basePrice: number
  disabled?: boolean
}) {
  const clamp = (n: number) => Math.min(maxQuantity, Math.max(minQuantity, n))
  const total = unitPrice * quantity
  const savings = (basePrice - unitPrice) * quantity
  const pieces = unitsPerPackage > 0 ? unitsPerPackage * quantity : null

  const stepClass =
    'flex w-12 items-center justify-center bg-muted text-xl text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40'

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex w-fit items-stretch overflow-hidden rounded-lg border-2 border-primary">
        <button
          type="button"
          aria-label="ลดจำนวน"
          disabled={disabled || quantity <= minQuantity}
          onClick={() => onQuantityChange(clamp(quantity - 1))}
          className={stepClass}
        >
          −
        </button>
        <input
          type="number"
          aria-label="จำนวนที่สั่งซื้อ"
          min={minQuantity}
          max={maxQuantity}
          value={quantity}
          disabled={disabled}
          onChange={(e) => onQuantityChange(clamp(Number(e.target.value) || minQuantity))}
          className="w-20 bg-background py-3 text-center text-xl font-bold tabular-nums outline-none [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="เพิ่มจำนวน"
          disabled={disabled || quantity >= maxQuantity}
          onClick={() => onQuantityChange(clamp(quantity + 1))}
          className={stepClass}
        >
          +
        </button>
        <span className="flex items-center bg-primary px-3.5 font-semibold text-primary-foreground">
          {unitNoun(packageUnit)}
        </span>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm">
        {pieces !== null && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">รวมทั้งหมด</dt>
            <dd className="font-semibold tabular-nums">{pieces.toLocaleString('th-TH')} ชิ้น</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">ราคาขั้นที่ใช้</dt>
          <dd className="font-semibold tabular-nums">
            {formatPrice(unitPrice)} / {quantityLabel(packageUnit, 1)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">สั่งขั้นต่ำ</dt>
          <dd className="font-semibold tabular-nums">
            {quantityLabel(packageUnit, minQuantity)}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2.5">
          <dt className="font-semibold text-foreground">รวม</dt>
          <dd className="text-2xl font-bold tabular-nums">{formatPrice(total)}</dd>
        </div>
      </dl>

      {savings > 0 && (
        <p
          className={cn(
            'rounded-md border px-3 py-2.5 text-center text-sm',
            'border-[var(--status-verified-bg)] bg-[var(--status-verified-bg)] text-[var(--price-per-unit)]',
          )}
        >
          ประหยัดจากราคาฐาน {formatPrice(savings)}
        </p>
      )}
    </div>
  )
}
