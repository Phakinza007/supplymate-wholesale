import { Link } from 'react-router-dom'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, perItemPrice, type PackageUnit } from '@/lib/wholesale'
import { useSearchSuggestions } from '@/core/catalog/useSearchSuggestions'

// Suggestions a wholesale buyer can act on: every row carries the pack size,
// how many price steps the product has, and the per-piece figure — the three
// numbers that decide whether it is worth opening at all.
export function SearchSuggestions({
  query,
  onDismiss,
  onRefine,
}: {
  query: string
  onDismiss: () => void
  onRefine: (params: { q?: string; tiered?: string; sort?: string }) => void
}) {
  const { data, isLoading } = useSearchSuggestions(query)

  if (query.trim().length < 2) return null
  if (isLoading) {
    return (
      <div className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground shadow-lg">
        กำลังค้นหา…
      </div>
    )
  }
  if (!data) return null

  const { products, previouslyOrdered } = data
  const empty = products.length === 0 && previouslyOrdered.length === 0

  return (
    <div
      role="listbox"
      aria-label="ผลการค้นหาแนะนำ"
      className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1 flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-lg"
    >
      {empty && (
        <p className="p-4 text-sm text-muted-foreground">
          ไม่พบสินค้าที่ตรงกับ “{query.trim()}”
        </p>
      )}

      {products.length > 0 && (
        <>
          <p className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            สินค้า
          </p>
          {products.map((product) => {
            const packageUnit = product.package_unit as PackageUnit
            const tierCount = product.product_price_tiers?.length ?? 0
            return (
              <Link
                key={product.id}
                role="option"
                aria-selected={false}
                to={`/products/${product.slug}`}
                onClick={onDismiss}
                className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{product.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatPackageLabel(packageUnit, product.units_per_package)}
                    {tierCount > 0 && ` · ราคาส่ง ${tierCount + 1} ขั้น`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">
                    {formatPrice(Number(product.price))}
                  </span>
                  <span className="block text-xs tabular-nums text-[var(--price-per-unit)]">
                    {formatPrice(perItemPrice(Number(product.price), product.units_per_package))}
                    /ชิ้น
                  </span>
                </span>
              </Link>
            )
          })}
        </>
      )}

      {/* Refinements restate the query as a filter rather than a new search —
          they are the two narrowings this catalogue can actually apply. */}
      <p className="border-y border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        ค้นหาแบบ
      </p>
      <div className="flex flex-wrap gap-2 p-3">
        <button
          type="button"
          onClick={() => onRefine({ q: query.trim(), tiered: '1' })}
          className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
        >
          “{query.trim()}” · เฉพาะที่มีราคาส่ง
        </button>
        <button
          type="button"
          onClick={() => onRefine({ q: query.trim(), sort: 'perPiece' })}
          className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
        >
          “{query.trim()}” · เรียงตามราคาต่อชิ้น
        </button>
      </div>

      {previouslyOrdered.length > 0 && (
        <>
          <p className="border-y border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            เคยสั่ง
          </p>
          {previouslyOrdered.map((line) => (
            <Link
              key={line.productSlug}
              role="option"
              aria-selected={false}
              to={`/products/${line.productSlug}`}
              onClick={onDismiss}
              className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-accent"
            >
              <span className="min-w-0 truncate">{line.productName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                สั่งล่าสุด{' '}
                {new Date(line.lastOrderedAt).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  )
}
