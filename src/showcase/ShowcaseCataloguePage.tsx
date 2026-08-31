import { Link, useSearchParams } from 'react-router-dom'
import { demoCategories, demoProducts, filterDemoProducts } from '@/demo/catalogue'
import { ShowcaseCategoryTile } from '@/showcase/ShowcaseCategoryTile'
import { ShowcaseHero } from '@/showcase/ShowcaseHero'
import { ShowcaseProductCard } from '@/showcase/ShowcaseProductCard'

interface ShowcaseCataloguePageProps {
  mode: 'home' | 'shop'
}

export function ShowcaseCataloguePage({ mode }: ShowcaseCataloguePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('query') ?? ''
  const categorySlug = searchParams.get('category') ?? ''
  const visibleProducts = filterDemoProducts(demoProducts, query, categorySlug)

  function updateFilter(name: 'query' | 'category', value: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) {
        next.set(name, value)
      } else {
        next.delete(name)
      }
      return next
    })
  }

  if (mode === 'home') {
    const categoryTiles = demoCategories.map((category) => {
      const products = demoProducts.filter((product) => product.categorySlug === category.slug)
      return { ...category, imagePath: products[0].imagePath, productCount: products.length }
    })

    return (
      <div className="flex flex-col gap-14 pb-8">
        <ShowcaseHero />

        <section aria-labelledby="category-title">
          <div className="showcase-section-header">
            <div>
              <p className="showcase-eyebrow">หมวดสินค้า</p>
              <h2 id="category-title" className="showcase-section-title">
                เลือกของใช้ให้ตรงกับงานในร้าน
              </h2>
            </div>
            <Link to="/shop" className="showcase-section-header__link">
              ค้นหาและกรองสินค้า
            </Link>
          </div>
          <div className="wholesale-category-strip mt-6">
            {categoryTiles.map((category) => (
              <ShowcaseCategoryTile key={category.slug} {...category} />
            ))}
          </div>
        </section>

        {/* The demo catalogue is small enough to show in full here; /shop is the
            same set with search and category filters on top. */}
        <section aria-labelledby="featured-title">
          <div className="max-w-2xl">
            <p className="showcase-eyebrow">รายการทั้งหมด</p>
            <h2 id="featured-title" className="showcase-section-title">
              สินค้าในแคตตาล็อกตัวอย่าง
            </h2>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demoProducts.map((product, index) => (
              <ShowcaseProductCard key={product.id} product={product} eager={index === 0} />
            ))}
          </div>
        </section>
      </div>
    )
  }

  const hasFilters = Boolean(query || categorySlug)

  return (
    <section aria-labelledby="shop-title" className="pb-8">
      <header className="max-w-3xl">
        <p className="showcase-eyebrow">แคตตาล็อกค้าส่ง</p>
        <h1 id="shop-title" className="showcase-page-title">
          เลือกสินค้าสำหรับร้านของคุณ
        </h1>
        <p className="showcase-lede">
          ค้นหาและกรองสินค้าตัวอย่างตามหมวด โดย URL จะจดจำตัวเลือกไว้เมื่อแชร์หรือย้อนกลับ
        </p>
      </header>

      <div className="wholesale-toolbar mt-8" role="search" aria-label="ค้นหาและกรองสินค้า">
        <div className="wholesale-toolbar__search">
          <input
            id="product-search"
            type="search"
            aria-label="ค้นหาสินค้า"
            placeholder="ค้นหาชื่อสินค้า"
            value={query}
            onChange={(event) => updateFilter('query', event.target.value)}
          />
        </div>
        <div role="group" aria-label="เลือกหมวดสินค้า" className="wholesale-toolbar__chips">
          <button
            type="button"
            onClick={() => updateFilter('category', '')}
            aria-pressed={categorySlug === ''}
            className="wholesale-chip"
          >
            ทั้งหมด
          </button>
          {demoCategories.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => updateFilter('category', category.slug)}
              aria-pressed={categorySlug === category.slug}
              className="wholesale-chip"
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="wholesale-toolbar__status">
          <p aria-live="polite" className="wholesale-toolbar__count">
            พบสินค้า {visibleProducts.length.toLocaleString('th-TH')} รายการ
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="wholesale-toolbar__clear"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="wholesale-empty mt-6">
          <p>ไม่พบสินค้าที่ตรงกับการค้นหา</p>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="showcase-button showcase-button--outline"
          >
            ล้างตัวกรองแล้วดูทั้งหมด
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <ShowcaseProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  )
}
