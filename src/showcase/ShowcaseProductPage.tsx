import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCartStore } from '@/core/cart/cartStore'
import { useToastStore } from '@/lib/toastStore'
import { demoCategories, findDemoProduct } from '@/demo/catalogue'
import { formatPrice } from '@/lib/formatPrice'
import { quantityLabel } from '@/lib/wholesale'
import { QuantityStepper } from '@/showcase/QuantityStepper'
import { WholesaleFacts } from '@/showcase/WholesaleFacts'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

export function ShowcaseProductPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const product = findDemoProduct(slug)
  const addItem = useCartStore((state) => state.addItem)
  const showToast = useToastStore((state) => state.show)
  const [quantity, setQuantity] = useState(product?.minOrderQuantity ?? 1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    setQuantity(product?.minOrderQuantity ?? 1)
    setAdded(false)
  }, [slug, product?.minOrderQuantity])

  if (!product) {
    return (
      <section className="py-12 text-center">
        <h1 className="showcase-page-title">ไม่พบสินค้าที่ต้องการ</h1>
        <Link to="/shop" className="mt-4 inline-block text-primary hover:underline">
          กลับไปดูสินค้า
        </Link>
      </section>
    )
  }

  const minimumQuantity = product.minOrderQuantity
  const category = demoCategories.find((item) => item.slug === product.categorySlug)

  return (
    <section className="mx-auto grid max-w-5xl gap-8 pb-8 md:grid-cols-2 md:items-start">
      <div className="overflow-hidden rounded-2xl border bg-card p-2">
        <img
          src={toShowcaseAssetUrl(product.imagePath)}
          alt={product.name}
          className="aspect-square w-full rounded-xl bg-muted object-cover"
        />
      </div>
      <div className="flex flex-col gap-5">
        <nav aria-label="เส้นทางหน้า" className="wholesale-breadcrumb">
          <ol>
            <li>
              <Link to="/">หน้าแรก</Link>
            </li>
            <li aria-hidden="true" className="wholesale-breadcrumb__separator">
              /
            </li>
            <li>
              <Link to={`/shop?category=${encodeURIComponent(product.categorySlug)}`}>
                {category?.name ?? 'แคตตาล็อก'}
              </Link>
            </li>
            <li aria-hidden="true" className="wholesale-breadcrumb__separator">
              /
            </li>
            <li aria-current="page">{product.name}</li>
          </ol>
        </nav>
        <div>
          <p className="showcase-eyebrow">ข้อมูลสินค้าค้าส่ง</p>
          <h1 className="showcase-page-title">{product.name}</h1>
        </div>
        <p className="wholesale-detail-price">
          {formatPrice(product.price)}
          <span className="wholesale-detail-price__unit">
            / {quantityLabel(product.packageUnit, 1)}
          </span>
        </p>
        <p className="leading-7 text-muted-foreground">{product.description}</p>
        <WholesaleFacts
          price={product.price}
          packageUnit={product.packageUnit}
          unitsPerPackage={product.unitsPerPackage}
          minOrderQuantity={product.minOrderQuantity}
        />
        <div className="rounded-2xl border bg-card p-4">
          <QuantityStepper
            inputId="product-quantity"
            value={quantity}
            min={minimumQuantity}
            onChange={setQuantity}
            packageUnit={product.packageUnit}
            unitsPerPackage={product.unitsPerPackage}
          />
        </div>
        <div className="wholesale-buy-bar">
          <p className="wholesale-buy-bar__total">
            {formatPrice(product.price * quantity)}
            <span>{quantityLabel(product.packageUnit, quantity)}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              addItem(
                {
                  productId: product.id,
                  variantId: null,
                  productName: product.name,
                  productSlug: product.slug,
                  variantName: null,
                  unitPrice: product.price,
                  imagePath: product.imagePath,
                  packageUnit: product.packageUnit,
                  minOrderQuantity: minimumQuantity,
                },
                quantity,
              )
              setAdded(true)
              showToast({
                title: 'เพิ่มลงตะกร้าแล้ว',
                detail: `${product.name} · ${quantityLabel(product.packageUnit, quantity)} · ${formatPrice(product.price * quantity)}`,
                action: { label: 'ดูตะกร้า', onClick: () => navigate('/cart') },
              })
            }}
            className="showcase-button showcase-button--primary"
          >
            เพิ่มลงตะกร้า
          </button>
        </div>
        {added && (
          <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-primary">เพิ่มสินค้าลงตะกร้าแล้ว</span>
            <Link to="/cart" className="font-semibold underline underline-offset-4">
              ดูตะกร้า
            </Link>
          </p>
        )}
      </div>
    </section>
  )
}
