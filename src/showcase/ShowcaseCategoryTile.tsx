import { Link } from 'react-router-dom'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

interface ShowcaseCategoryTileProps {
  name: string
  slug: string
  imagePath: string
  productCount: number
}

export function ShowcaseCategoryTile({ name, slug, imagePath, productCount }: ShowcaseCategoryTileProps) {
  return (
    <Link
      to={`/shop?category=${encodeURIComponent(slug)}`}
      className="wholesale-category-tile"
    >
      <img
        src={toShowcaseAssetUrl(imagePath)}
        alt=""
        className="wholesale-category-tile__image"
      />
      <span className="wholesale-category-tile__content">
        <span className="wholesale-category-tile__name">{name}</span>
        <span className="wholesale-category-tile__count">{productCount.toLocaleString('th-TH')} รายการ</span>
      </span>
    </Link>
  )
}
