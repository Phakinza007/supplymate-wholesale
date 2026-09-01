import { Link } from 'react-router-dom'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { ProductImageFallback } from './ProductImageFallback'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, perItemPrice, quantityLabel, type PackageUnit } from '@/lib/wholesale'
import { cheapestTier, type PriceTier } from '@/lib/priceTiers'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row'] & {
  product_images: Database['public']['Tables']['product_images']['Row'][]
  product_price_tiers?: PriceTier[]
}

export function ProductCard({ product }: { product: Product }) {
  const image = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]
  const packageUnit = product.package_unit as PackageUnit
  const price = Number(product.price)
  const tiers = product.product_price_tiers ?? []
  const best = cheapestTier(tiers)

  return (
    <Link
      to={`/products/${product.slug}`}
      data-tour="catalogue-tiers"
      data-tour-tiers={tiers.length > 0 ? 'true' : undefined}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-input"
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        {image ? (
          <img
            src={resolveImageUrl(image.storage_path)}
            alt={image.alt ?? product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <ProductImageFallback />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {formatPackageLabel(packageUnit, product.units_per_package)}
          </span>
          {tiers.length > 0 && (
            <Badge tone="pending">{tiers.length + 1} ขั้น</Badge>
          )}
        </div>
        <h3 className="mt-1 leading-snug font-semibold text-balance">{product.name}</h3>

        <p className="mt-2.5 flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums tracking-tight">
            {formatPrice(price)}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            / {quantityLabel(packageUnit, 1)}
          </span>
          {product.compare_at_price && (
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              {formatPrice(Number(product.compare_at_price))}
            </span>
          )}
        </p>

        {/* Three levels, not one. The old card stacked per-piece, minimum and the
            volume price as three rows of the same small grey text, so nothing
            could be scanned -- the line carrying the wholesale promise was the
            smallest and last. Per-unit and minimum are supporting detail and
            read as one quiet line; the volume price gets a band of its own. */}
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {formatPrice(perItemPrice(price, product.units_per_package))} ต่อชิ้น · ขั้นต่ำ{' '}
          {quantityLabel(packageUnit, product.min_order_quantity)}
        </p>

        {/* Always rendered, tiers or not. An attribute that appears on some
            cards and vanishes on others reads as "this product lacks it"
            rather than "this shop did not print it", and it leaves the grid
            ragged. */}
        <div className="mt-auto pt-2.5">
          {best ? (
            <div className="flex items-baseline justify-between gap-2 rounded-md bg-[var(--price-per-unit-bg)] px-2.5 py-1.5">
              <span className="text-xs font-semibold text-[var(--price-per-unit)]">
                สั่ง {quantityLabel(packageUnit, best.min_quantity)}
              </span>
              <span className="text-sm font-bold text-[var(--price-per-unit)] tabular-nums">
                {formatPrice(perItemPrice(Number(best.unit_price), product.units_per_package))}
                <span className="text-xs font-semibold"> / ชิ้น</span>
              </span>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">ราคาเดียวทุกจำนวน</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
