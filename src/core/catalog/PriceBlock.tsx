import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, quantityLabel, type PackageUnit } from '@/lib/wholesale'
import { Badge } from '@/components/ui/badge'

// The price block, in the order a wholesale buyer reads it:
//   1. what a unit *is*      — "1 ลัง = 1,000 ชิ้น", above the number, so
//      nobody mistakes a per-carton price for a per-piece one
//   2. what they pay          — the per-carton price, the largest thing here
//   3. what they compare      — the per-piece price, in green, deliberately
//      smaller: it is a comparison figure, not the amount charged
export function PriceBlock({
  unitPrice,
  basePrice,
  packageUnit,
  unitsPerPackage,
  tierCount,
  quantity,
}: {
  unitPrice: number
  basePrice: number
  packageUnit: PackageUnit
  unitsPerPackage: number
  tierCount: number
  quantity?: number
}) {
  const discounted = unitPrice < basePrice
  const perPiece = unitsPerPackage > 0 ? unitPrice / unitsPerPackage : null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{formatPackageLabel(packageUnit, unitsPerPackage)}</Badge>
        {tierCount > 0 && <Badge tone="pending">ราคาส่ง {tierCount} ขั้น</Badge>}
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
          {formatPrice(unitPrice)}
        </span>
        <span className="text-lg text-muted-foreground">/ {quantityLabel(packageUnit, 1)}</span>
        {discounted && (
          <span className="text-base text-muted-foreground line-through tabular-nums">
            {formatPrice(basePrice)}
          </span>
        )}
      </div>

      {perPiece !== null && (
        <p className="text-base font-semibold text-[var(--price-per-unit)] tabular-nums">
          {formatPrice(perPiece)}{' '}
          <span className="font-normal text-muted-foreground">
            ต่อชิ้น
            {quantity !== undefined && ` ที่จำนวน ${quantityLabel(packageUnit, quantity)}`}
          </span>
        </p>
      )}
    </div>
  )
}
