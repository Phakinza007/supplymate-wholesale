import { formatPrice } from '@/lib/formatPrice'
import { quantityLabel, unitNoun, type PackageUnit } from '@/lib/wholesale'
import type { PriceTierRow, TierUpgrade } from '@/lib/priceTiers'
import { cn } from '@/lib/utils'

function rangeLabel(from: number, to: number | null): string {
  return to === null ? `${from.toLocaleString('th-TH')}+` : `${from}–${to}`
}

// Compact: three rows and a link out, for a card. Full: every tier plus the
// savings column and the next-tier nudge, for the product page.
//
// Rows and the upgrade nudge are computed by the CALLER, not here, so the price
// chip's step count and this table read the same array -- deriving the ladder
// in both places is exactly how the chip once said "6 ขั้น" next to a 7-row
// table.
export function TierLadder({
  rows,
  upgrade = null,
  packageUnit,
  variant = 'full',
  onExpand,
}: {
  rows: PriceTierRow[]
  upgrade?: TierUpgrade | null
  packageUnit: PackageUnit
  variant?: 'full' | 'compact'
  onExpand?: () => void
}) {
  if (rows.length < 2) return null

  const compact = variant === 'compact'
  const visible = compact ? rows.slice(0, 3) : rows
  const showSavings = !compact
  const shownUpgrade = compact ? null : upgrade

  return (
    <section className="flex flex-col gap-3" aria-labelledby="tier-ladder-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tier-ladder-heading" className="font-semibold text-foreground">
          {compact ? 'ยิ่งสั่งมาก ยิ่งถูก' : 'ราคาขั้นบันได'}
        </h2>
        <span className="text-sm text-muted-foreground">{rows.length} ขั้น</span>
      </div>

      {!compact && (
        <p className="text-sm text-muted-foreground">
          ระบบใช้ราคาขั้นที่ตรงกับจำนวนในตะกร้าโดยอัตโนมัติ ไม่ต้องแจ้งพนักงาน
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse overflow-hidden rounded-md border text-sm">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                จำนวน ({unitNoun(packageUnit)})
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                ต่อ{unitNoun(packageUnit)}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                ต่อชิ้น
              </th>
              {showSavings && (
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  ประหยัด
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.from}
                aria-current={row.isCurrent ? 'true' : undefined}
                className={cn(
                  'border-t',
                  row.isCurrent &&
                    'bg-[var(--tier-current-bg)] font-semibold text-foreground [border-top-color:var(--tier-current-border)] [border-top-width:2px]',
                )}
              >
                <td className="px-3 py-2">
                  {rangeLabel(row.from, row.to)}
                  {row.isCurrent && (
                    <span className="ml-2 rounded-sm bg-primary px-1.5 py-0.5 align-middle text-[0.625rem] font-semibold text-primary-foreground">
                      ขั้นของคุณ
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatPrice(row.unitPrice)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2 text-right tabular-nums',
                    row.savingsPct > 0 ? 'text-[var(--price-per-unit)]' : 'text-muted-foreground',
                  )}
                >
                  {row.perPiecePrice === null ? '—' : formatPrice(row.perPiecePrice)}
                </td>
                {showSavings && (
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-semibold tabular-nums',
                      row.savingsPct > 0
                        ? 'text-[var(--price-per-unit)]'
                        : 'font-normal text-muted-foreground',
                    )}
                  >
                    {row.savingsPct > 0 ? `${row.savingsPct}%` : '—'}
                  </td>
                )}
              </tr>
            ))}
            {compact && rows.length > visible.length && onExpand && (
              <tr className="border-t">
                <td colSpan={3} className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={onExpand}
                    className="font-semibold text-[var(--brand-secondary)] hover:underline"
                  >
                    ดูทั้ง {rows.length} ขั้น
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shownUpgrade && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3.5 py-3 text-sm">
          <span className="text-muted-foreground">
            เพิ่มอีก{' '}
            <strong className="font-semibold text-foreground">
              {quantityLabel(packageUnit, shownUpgrade.unitsNeeded)}
            </strong>{' '}
            เพื่อลงขั้น {formatPrice(shownUpgrade.unitPrice)}
          </span>
          {shownUpgrade.savings > 0 && (
            <span className="font-semibold text-[var(--price-per-unit)] tabular-nums">
              ประหยัด {formatPrice(shownUpgrade.savings)}
            </span>
          )}
        </p>
      )}
    </section>
  )
}
