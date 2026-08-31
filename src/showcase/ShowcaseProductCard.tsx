import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCartStore } from '@/core/cart/cartStore'
import type { DemoProduct } from '@/demo/catalogue'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, perItemPrice, quantityLabel } from '@/lib/wholesale'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

interface ShowcaseProductCardProps {
  product: DemoProduct
  eager?: boolean
}

export function ShowcaseProductCard({ product, eager = false }: ShowcaseProductCardProps) {
  const addItem = useCartStore((state) => state.addItem)
  const [added, setAdded] = useState(false)

  return (
    <article className="wholesale-product-card">
      <Link to={`/products/${product.slug}`} className="wholesale-product-card__image-link">
        <img
          src={toShowcaseAssetUrl(product.imagePath)}
          alt={product.name}
          loading={eager ? 'eager' : 'lazy'}
        />
      </Link>
      <div className="wholesale-product-card__body">
        <p className="wholesale-product-card__eyebrow">
          {formatPackageLabel(product.packageUnit, product.unitsPerPackage)}
        </p>
        <h3>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="wholesale-product-card__price">
          {formatPrice(product.price)}
          <span className="wholesale-product-card__price-unit">
            / {quantityLabel(product.packageUnit, 1)}
          </span>
        </p>
        {/* Same three rows, same order, on every card — a buyer scans down one
            column instead of re-reading each card's prose. */}
        <dl className="wholesale-spec-list">
          <div>
            <dt>เฉลี่ยต่อชิ้น</dt>
            <dd>{formatPrice(perItemPrice(product.price, product.unitsPerPackage))}</dd>
          </div>
          <div>
            <dt>จำนวนต่อหน่วย</dt>
            <dd>{product.unitsPerPackage.toLocaleString('th-TH')} ชิ้น</dd>
          </div>
          <div>
            <dt>สั่งขั้นต่ำ</dt>
            <dd>{quantityLabel(product.packageUnit, product.minOrderQuantity)}</dd>
          </div>
        </dl>
        <div className="wholesale-product-card__actions">
          <button
            type="button"
            aria-label={`เพิ่ม ${product.name} ลงตะกร้า`}
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
                  minOrderQuantity: product.minOrderQuantity,
                },
                product.minOrderQuantity,
              )
              setAdded(true)
            }}
            className="showcase-button showcase-button--outline showcase-button--block"
          >
            {added
              ? `เพิ่มแล้ว · ${quantityLabel(product.packageUnit, product.minOrderQuantity)}`
              : `เพิ่ม ${quantityLabel(product.packageUnit, product.minOrderQuantity)}`}
          </button>
        </div>
      </div>
    </article>
  )
}
