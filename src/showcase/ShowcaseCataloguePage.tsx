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
      <div className="flex flex-col gap-16 pb-8">
        <ShowcaseHero />

        <section aria-labelledby="category-title">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold text-primary">หมวดสินค้า</p>
              <h2 id="category-title" className="mt-2 text-3xl font-semibold tracking-tight">
                เลือกของใช้ให้ตรงกับงานในร้าน
              </h2>
            </div>
            <Link to="/shop" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
              ดูสินค้าทั้งหมด
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryTiles.map((category) => (
              <ShowcaseCategoryTile key={category.slug} {...category} />
            ))}
          </div>
        </section>

        <section aria-labelledby="featured-title">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">สินค้าสำหรับเริ่มต้น</p>
            <h2 id="featured-title" className="mt-2 text-3xl font-semibold tracking-tight">
              สินค้าแนะนำจากแคตตาล็อก
            </h2>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demoProducts.slice(0, 3).map((product, index) => (
              <ShowcaseProductCard key={product.id} product={product} eager={index === 0} />
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <section aria-labelledby="shop-title" className="pb-8">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">แคตตาล็อกค้าส่ง</p>
        <h1 id="shop-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          เลือกสินค้าสำหรับร้านของคุณ
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          ค้นหาและกรองสินค้าตัวอย่างตามหมวด โดย URL จะจดจำตัวเลือกไว้เมื่อแชร์หรือย้อนกลับ
        </p>
      </header>

      <section aria-labelledby="catalogue-filter-title" className="mt-8 rounded-2xl border bg-card p-5">
        <h2 id="catalogue-filter-title" className="text-lg font-semibold">
          ค้นหาและกรองสินค้า
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="product-search" className="font-semibold">
            ค้นหาสินค้า
          </label>
          <input
            id="product-search"
            type="search"
            value={query}
            onChange={(event) => updateFilter('query', event.target.value)}
            className="min-h-11 w-full rounded-lg border bg-background px-3 py-2 sm:max-w-xl"
          />
        </div>
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">เลือกหมวดสินค้า</p>
          <div role="group" aria-label="เลือกหมวดสินค้า" className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateFilter('category', '')}
              aria-pressed={categorySlug === ''}
              className="rounded-full border px-3 py-1.5 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              ทั้งหมด
            </button>
            {demoCategories.map((category) => (
              <button
                key={category.slug}
                type="button"
                onClick={() => updateFilter('category', category.slug)}
                aria-pressed={categorySlug === category.slug}
                className="rounded-full border px-3 py-1.5 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="font-semibold">
          พบสินค้า {visibleProducts.length.toLocaleString('th-TH')} รายการ
        </p>
        {(query || categorySlug) && (
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="rounded-lg border px-3 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {visibleProducts.length === 0 ? (
        <p className="mt-8 rounded-2xl border bg-card p-6 text-muted-foreground">
          ไม่พบสินค้าที่ตรงกับการค้นหา
        </p>
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
