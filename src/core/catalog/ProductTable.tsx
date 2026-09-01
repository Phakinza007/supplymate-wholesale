import { Link } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatPrice } from '@/lib/formatPrice'
import { perItemPrice, quantityLabel, unitNoun, type PackageUnit } from '@/lib/wholesale'
import { cheapestTier, type PriceTier } from '@/lib/priceTiers'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row'] & {
  product_images: Database['public']['Tables']['product_images']['Row'][]
  product_price_tiers?: PriceTier[]
}

/**
 * The catalogue as a table, for the buyer who is comparing rather than
 * browsing. Modelled on how trade distributors actually list stock: one row per
 * product, figures right-aligned so the eye tracks down a column instead of
 * re-reading each card.
 *
 * The columns are deliberately NOT the tier quantities themselves. A
 * distributor can use fixed break columns (1 / 2 / 3 / 5+) because every
 * product in a family breaks at the same quantities; here they do not — this
 * catalogue already carries two different ladders. Columns have to be
 * comparable across every row to be worth scanning, so the ladder is reduced to
 * its endpoints: what a piece costs at the minimum, and what it costs at the
 * bottom of the ladder.
 */
export function ProductTable({ products }: { products: Product[] }) {
  return (
    <div className="animate-in fade-in duration-150 motion-reduce:animate-none">
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow>
            <TableHead>สินค้า</TableHead>
            <TableHead className="text-right">ราคา / หน่วย</TableHead>
            <TableHead className="text-right">ต่อชิ้น</TableHead>
            <TableHead className="text-right">ถูกสุดต่อชิ้น</TableHead>
            <TableHead className="text-right">ขั้นต่ำ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const packageUnit = product.package_unit as PackageUnit
            const price = Number(product.price)
            const tiers = product.product_price_tiers ?? []
            const best = cheapestTier(tiers)
            const image = [...product.product_images].sort(
              (a, b) => a.sort_order - b.sort_order,
            )[0]

            return (
              <TableRow key={product.id}>
                <TableCell>
                  <Link
                    to={`/products/${product.slug}`}
                    data-tour="catalogue-tiers"
                    data-tour-tiers={tiers.length > 0 ? 'true' : undefined}
                    className="flex items-center gap-3 font-semibold hover:underline"
                  >
                    <span className="size-10 shrink-0 overflow-hidden rounded bg-muted">
                      {image && (
                        <img
                          src={resolveImageUrl(image.storage_path)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="leading-snug">{product.name}</span>
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {product.units_per_package.toLocaleString('th-TH')} ชิ้น /{' '}
                        {unitNoun(packageUnit)}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPrice(price)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(perItemPrice(price, product.units_per_package))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {best ? (
                    <span className="flex flex-col items-end">
                      <span className="font-semibold text-[var(--price-per-unit)]">
                        {formatPrice(
                          perItemPrice(Number(best.unit_price), product.units_per_package),
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        เมื่อสั่ง {quantityLabel(packageUnit, best.min_quantity)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {quantityLabel(packageUnit, product.min_order_quantity)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
