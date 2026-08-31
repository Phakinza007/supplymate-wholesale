import { Link } from 'react-router-dom'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, perItemPrice, quantityLabel, type PackageUnit } from '@/lib/wholesale'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row'] & {
  product_images: Database['public']['Tables']['product_images']['Row'][]
}

export function ProductCard({ product }: { product: Product }) {
  const image = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]
  const packageUnit = product.package_unit as PackageUnit
  const price = Number(product.price)

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-input"
    >
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        {image && (
          <img
            src={resolveImageUrl(image.storage_path)}
            alt={image.alt ?? product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-xs font-semibold text-muted-foreground">
          {formatPackageLabel(packageUnit, product.units_per_package)}
        </p>
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

        {/* The same two rows on every card, aligned, so a buyer compares down a
            column instead of re-reading each card. */}
        <dl className="mt-2.5 flex flex-col border-t border-border text-xs">
          <div className="flex items-baseline justify-between gap-3 border-b border-border/55 py-1.5">
            <dt className="text-muted-foreground">เฉลี่ยต่อชิ้น</dt>
            <dd className="font-semibold tabular-nums">
              {formatPrice(perItemPrice(price, product.units_per_package))}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground">สั่งขั้นต่ำ</dt>
            <dd className="font-semibold tabular-nums">
              {quantityLabel(packageUnit, product.min_order_quantity)}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  )
}
