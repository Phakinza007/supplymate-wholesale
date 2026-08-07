import { Link } from 'react-router-dom'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, quantityLabel, type PackageUnit } from '@/lib/wholesale'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row'] & {
  product_images: Database['public']['Tables']['product_images']['Row'][]
}

export function ProductCard({ product }: { product: Product }) {
  const image = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]
  const packageUnit = product.package_unit as PackageUnit

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex flex-col gap-2 rounded-md border p-3 transition-colors hover:border-foreground/30"
    >
      <div className="aspect-square overflow-hidden rounded-sm bg-muted">
        {image && (
          <img
            src={resolveImageUrl(image.storage_path)}
            alt={image.alt ?? product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
      </div>
      <div>
        <p className="font-medium">{product.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {formatPrice(Number(product.price))} / {quantityLabel(packageUnit, 1)}
          </span>
          {product.compare_at_price && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(Number(product.compare_at_price))}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatPackageLabel(packageUnit, product.units_per_package)}
        </p>
      </div>
    </Link>
  )
}
