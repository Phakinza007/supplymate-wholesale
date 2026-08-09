import { Link } from 'react-router-dom'
import type { DemoProduct } from '@/demo/catalogue'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, perItemPrice, quantityLabel } from '@/lib/wholesale'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

interface ShowcaseProductCardProps {
  product: DemoProduct
  eager?: boolean
}

export function ShowcaseProductCard({ product, eager = false }: ShowcaseProductCardProps) {
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
        <p className="wholesale-product-card__eyebrow">{formatPackageLabel(product.packageUnit, product.unitsPerPackage)}</p>
        <h3><Link to={`/products/${product.slug}`}>{product.name}</Link></h3>
        <p className="wholesale-product-card__price">{formatPrice(product.price)} / {quantityLabel(product.packageUnit, 1)}</p>
        <p className="wholesale-product-card__unit">เฉลี่ย {formatPrice(perItemPrice(product.price, product.unitsPerPackage))} / ชิ้น</p>
        <p className="wholesale-product-card__moq">ขั้นต่ำ {quantityLabel(product.packageUnit, product.minOrderQuantity)}</p>
      </div>
    </article>
  )
}
