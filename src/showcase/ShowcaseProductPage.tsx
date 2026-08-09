import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCartStore } from '@/core/cart/cartStore'
import { clampToMinimum, findDemoProduct } from '@/demo/catalogue'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'
import { WholesaleFacts } from '@/showcase/WholesaleFacts'

export function ShowcaseProductPage() {
  const { slug = '' } = useParams()
  const product = findDemoProduct(slug)
  const addItem = useCartStore((state) => state.addItem)
  const [quantity, setQuantity] = useState(product?.minOrderQuantity ?? 1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    setQuantity(product?.minOrderQuantity ?? 1)
    setAdded(false)
  }, [slug, product?.minOrderQuantity])

  if (!product) {
    return (
      <section className="py-12 text-center">
        <h1 className="text-2xl font-semibold">ไม่พบสินค้าที่ต้องการ</h1>
        <Link to="/shop" className="mt-4 inline-block text-primary hover:underline">
          กลับไปดูสินค้า
        </Link>
      </section>
    )
  }

  const minimumQuantity = product.minOrderQuantity

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
        <Link to={`/shop?category=${product.categorySlug}`} className="text-sm text-muted-foreground hover:underline">
          ← กลับไปยังสินค้า
        </Link>
        <div>
          <p className="text-sm font-semibold text-primary">ข้อมูลสินค้าค้าส่ง</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
        </div>
        <p className="leading-7 text-muted-foreground">{product.description}</p>
        <WholesaleFacts
          price={product.price}
          packageUnit={product.packageUnit}
          unitsPerPackage={product.unitsPerPackage}
          minOrderQuantity={product.minOrderQuantity}
        />
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            จำนวน
            <input
              type="number"
              min={minimumQuantity}
              value={quantity}
              onChange={(event) =>
                setQuantity(clampToMinimum(Number(event.target.value), minimumQuantity))
              }
              className="w-24 rounded-lg border bg-background px-3 py-2"
            />
          </label>
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
            }}
            className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground"
          >
            เพิ่มลงตะกร้า
          </button>
        </div>
        {added && <p role="status" className="text-sm font-medium text-primary">เพิ่มสินค้าลงตะกร้าแล้ว</p>}
      </div>
    </section>
  )
}
