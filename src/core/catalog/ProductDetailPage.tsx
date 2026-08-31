import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { buildTierRows, nextTierUpgrade, resolveTierPrice, sortTiers } from '@/lib/priceTiers'
import { PriceBlock } from '@/core/catalog/PriceBlock'
import { TierLadder } from '@/core/catalog/TierLadder'
import { QuantityCalculator } from '@/core/catalog/QuantityCalculator'
import { useCartStore } from '@/core/cart/cartStore'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Feature } from '@/lib/Feature'
import { quantityLabel, type PackageUnit } from '@/lib/wholesale'
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
  const tierRows = buildTierRows(
    Number(product.price),
    tiers,
    minimumQuantity,
    product.units_per_package,
    quantity,
  )
  const tierUpgrade = nextTierUpgrade(Number(product.price), tiers, quantity)

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
          <PriceBlock
            unitPrice={effectiveUnitPrice}
            basePrice={Number(product.price)}
            packageUnit={packageUnit}
            unitsPerPackage={product.units_per_package}
            tierCount={tierRows.length > 1 ? tierRows.length : 0}
            quantity={quantity}
          />
          {product.compare_at_price && (
            <p className="text-sm text-muted-foreground">
              ราคาปกติ{' '}
              <span className="line-through tabular-nums">
                {formatPrice(Number(product.compare_at_price))}
              </span>
            </p>
          )}
          <TierLadder rows={tierRows} upgrade={tierUpgrade} packageUnit={packageUnit} />
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
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <QuantityCalculator
              quantity={quantity}
              onQuantityChange={setQuantity}
              minQuantity={minimumQuantity}
              maxQuantity={maxQuantity}
              packageUnit={packageUnit}
              unitsPerPackage={product.units_per_package}
              unitPrice={effectiveUnitPrice}
              basePrice={Number(product.price)}
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
