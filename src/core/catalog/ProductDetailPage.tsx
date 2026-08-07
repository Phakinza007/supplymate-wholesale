import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { useCartStore } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError || !product) return <p className="p-8 text-destructive">Product not found.</p>

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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">
      {product.categories && (
        <Link
          to={`/shop?category=${product.categories.slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {product.categories.name}
        </Link>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="aspect-square overflow-hidden rounded-md bg-muted">
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
                  className={
                    'h-16 w-16 overflow-hidden rounded-sm border ' +
                    (i === activeImageIndex ? 'border-foreground' : 'border-transparent')
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
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {formatPrice(selectedVariant?.price_override ?? Number(product.price))} /{' '}
              {quantityLabel(packageUnit, 1)}
            </span>
            {product.compare_at_price && (
              <span className="text-muted-foreground line-through">
                {formatPrice(Number(product.compare_at_price))}
              </span>
            )}
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {formatPackageLabel(packageUnit, product.units_per_package)}
            </p>
            <p className="text-muted-foreground">
              สั่งขั้นต่ำ {quantityLabel(packageUnit, minimumQuantity)} ต่อรายการ
            </p>
          </div>
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
                <p className="text-sm text-muted-foreground">
                  {selectedVariant.stock_quantity > 0
                    ? `${selectedVariant.stock_quantity} in stock`
                    : 'Out of stock'}
                </p>
              )
            : product.track_inventory && (
                <p className="text-sm text-muted-foreground">
                  {product.stock_quantity > 0
                    ? `${product.stock_quantity} in stock`
                    : 'Out of stock'}
                </p>
              )}
          {product.description && <p className="text-sm">{product.description}</p>}
          <div className="flex items-center gap-3">
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
              className="w-20"
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
                    unitPrice: selectedVariant?.price_override ?? Number(product.price),
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
                ? 'Unable to load options'
                : needsSelection
                  ? 'Select an option'
                  : outOfStock
                    ? 'Out of stock'
                    : 'Add to cart'}
            </Button>
            {justAdded && <span className="text-sm text-muted-foreground">Added ✓</span>}
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
