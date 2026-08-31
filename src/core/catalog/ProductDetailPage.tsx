import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { resolveTierPrice, sortTiers } from '@/lib/priceTiers'
import { useCartStore } from '@/core/cart/cartStore'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Feature } from '@/lib/Feature'
import { formatPackageLabel, quantityLabel, type PackageUnit } from '@/lib/wholesale'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

const Reviews = lazy(() => import('@/modules/optional/reviews'))
const VariantSelector = lazy(() => import('@/modules/optional/variants/VariantSelector'))

export function ProductDetailPage() {
  const { slug } = useParams()
  const { data: product, isLoading, isError } = useProduct(slug)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [variantsErrored, setVariantsErrored] = useState(false)
  const addItem = useCartStore((state) => state.addItem)

  useEffect(() => {
    if (product) setQuantity(product.min_order_quantity)
  }, [product])

  if (isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-10 md:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-48" />
        </div>
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <Alert tone="error" title="ไม่พบสินค้านี้">
          สินค้าอาจถูกปิดการขายหรือลิงก์ไม่ถูกต้อง{' '}
          <Link to="/shop" className="font-semibold underline underline-offset-4">
            กลับไปดูแคตตาล็อก
          </Link>
        </Alert>
      </div>
    )
  }

  const images = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)
  const activeImage = images[activeImageIndex]
  const needsSelection = hasVariants && !selectedVariant
  const packageUnit = product.package_unit as PackageUnit
  const minimumQuantity = product.min_order_quantity
  const availableStock = hasVariants
    ? (selectedVariant?.stock_quantity ?? null)
    : product.track_inventory
      ? product.stock_quantity
      : null
  const outOfStock = availableStock !== null && availableStock < minimumQuantity
  const addToCartDisabled = variantsErrored || outOfStock || needsSelection
  const maxQuantity = availableStock ?? Math.max(99, minimumQuantity)
  const tiers = sortTiers(product.product_price_tiers ?? [])
  // A variant price_override is an explicit per-variant price and is never
  // undercut by a product-level tier.
  const effectiveUnitPrice =
    selectedVariant?.price_override ?? resolveTierPrice(Number(product.price), tiers, quantity)
  const tierApplied = effectiveUnitPrice < Number(product.price)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      {product.categories && (
        <Link
          to={`/shop?category=${product.categories.slug}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-signal hover:underline"
        >
          ← {product.categories.name}
        </Link>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
            {activeImage && (
              <img
                src={resolveImageUrl(activeImage.storage_path)}
                alt={activeImage.alt ?? product.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.map((image, i) => (
                <button
                  key={image.id}
                  onClick={() => setActiveImageIndex(i)}
                  type="button"
                  aria-label={`ดูรูปที่ ${i + 1}`}
                  aria-pressed={i === activeImageIndex}
                  className={
                    'size-16 overflow-hidden rounded-md border ' +
                    (i === activeImageIndex ? 'border-primary' : 'border-border')
                  }
                >
                  <img
                    src={resolveImageUrl(image.storage_path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-[length:var(--text-app-title)] font-bold tracking-tight text-balance">
            {product.name}
          </h1>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {formatPrice(effectiveUnitPrice)}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">
              / {quantityLabel(packageUnit, 1)}
            </span>
            {tierApplied && (
              <>
                <span className="text-sm text-muted-foreground line-through tabular-nums">
                  {formatPrice(Number(product.price))}
                </span>
                <Badge tone="verified">ราคาตามจำนวน</Badge>
              </>
            )}
            {product.compare_at_price && (
              <span className="text-sm text-muted-foreground line-through tabular-nums">
                {formatPrice(Number(product.compare_at_price))}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-card text-sm">
            <div className="border-r border-border p-3">
              <dt className="text-xs text-muted-foreground">จำนวนต่อหน่วย</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {formatPackageLabel(packageUnit, product.units_per_package)}
              </dd>
            </div>
            <div className="p-3">
              <dt className="text-xs text-muted-foreground">สั่งขั้นต่ำ</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {quantityLabel(packageUnit, minimumQuantity)} ต่อรายการ
              </dd>
            </div>
          </dl>
          {tiers.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3 text-sm">
              <p className="mb-2 font-semibold">ราคาขายส่งตามจำนวน</p>
              <table className="w-full">
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-1.5">{quantityLabel(packageUnit, minimumQuantity)} ขึ้นไป</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatPrice(Number(product.price))}
                    </td>
                  </tr>
                  {tiers.map((tier) => (
                    <tr
                      key={tier.id}
                      className={
                        'border-b border-border last:border-0 ' +
                        (effectiveUnitPrice === Number(tier.unit_price) ? 'font-bold' : '')
                      }
                    >
                      <td className="py-1.5">
                        {quantityLabel(packageUnit, tier.min_quantity)} ขึ้นไป
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatPrice(Number(tier.unit_price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                ราคาต่อหน่วยจะปรับอัตโนมัติตามจำนวนที่สั่ง
              </p>
            </div>
          )}
          <Feature flag="variants">
            <Suspense fallback={null}>
              <VariantSelector
                productId={product.id}
                selectedVariantId={selectedVariant?.id ?? null}
                onVariantsLoaded={setHasVariants}
                onSelect={setSelectedVariant}
                onError={() => setVariantsErrored(true)}
              />
            </Suspense>
          </Feature>
          {hasVariants
            ? selectedVariant && (
                <p className="text-sm tabular-nums text-muted-foreground">
                  {selectedVariant.stock_quantity > 0
                    ? `คงเหลือ ${quantityLabel(packageUnit, selectedVariant.stock_quantity)}`
                    : 'สินค้าหมด'}
                </p>
              )
            : product.track_inventory && (
                <p className="text-sm tabular-nums text-muted-foreground">
                  {product.stock_quantity > 0
                    ? `คงเหลือ ${quantityLabel(packageUnit, product.stock_quantity)}`
                    : 'สินค้าหมด'}
                </p>
              )}
          {product.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Input
              type="number"
              aria-label="จำนวนที่สั่งซื้อ"
              min={minimumQuantity}
              max={maxQuantity}
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.min(
                    maxQuantity,
                    Math.max(minimumQuantity, Number(e.target.value) || minimumQuantity),
                  ),
                )
              }
              className="w-24"
              disabled={addToCartDisabled}
            />
            <Button
              disabled={addToCartDisabled}
              onClick={() => {
                addItem(
                  {
                    productId: product.id,
                    variantId: selectedVariant?.id ?? null,
                    productName: product.name,
                    productSlug: product.slug,
                    variantName: selectedVariant?.name ?? null,
                    unitPrice: effectiveUnitPrice,
                    imagePath: images[0]?.storage_path ?? null,
                    packageUnit,
                    minOrderQuantity: minimumQuantity,
                  },
                  Math.max(minimumQuantity, quantity),
                )
                setJustAdded(true)
                setTimeout(() => setJustAdded(false), 2000)
              }}
            >
              {variantsErrored
                ? 'โหลดตัวเลือกไม่ได้'
                : needsSelection
                  ? 'เลือกตัวเลือกก่อน'
                  : outOfStock
                    ? 'สินค้าหมด'
                    : 'เพิ่มลงตะกร้า'}
            </Button>
            {justAdded && (
              <span role="status" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">เพิ่มแล้ว</span>
                <Link to="/cart" className="font-semibold text-signal underline underline-offset-4">
                  ดูตะกร้า
                </Link>
              </span>
            )}
          </div>
        </div>
      </div>

      <Feature flag="reviews">
        <Suspense fallback={null}>
          <Reviews productId={product.id} />
        </Suspense>
      </Feature>
    </div>
  )
}
