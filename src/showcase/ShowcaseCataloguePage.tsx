import { Link, useSearchParams } from 'react-router-dom'
import { formatPrice } from '@/lib/formatPrice'
import { formatPackageLabel, quantityLabel } from '@/lib/wholesale'
import { demoCategories, demoProducts, filterDemoProducts, type DemoProduct } from '@/demo/catalogue'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

interface ShowcaseCataloguePageProps {
  mode: 'home' | 'shop'
}

function ProductCard({ product }: { product: DemoProduct }) {
  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/50"
    >
      <img
        src={toShowcaseAssetUrl(product.imagePath)}
        alt={product.name}
        className="aspect-square w-full bg-muted object-cover transition-transform group-hover:scale-105"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold">{product.name}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{product.description}</p>
        <div className="mt-auto pt-2">
          <p className="font-semibold">
            {formatPrice(product.price)} / {quantityLabel(product.packageUnit, 1)}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatPackageLabel(product.packageUnit, product.unitsPerPackage)}
          </p>
        </div>
      </div>
    </Link>
  )
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
    const featuredProducts = visibleProducts.slice(0, 3)

    return (
      <div className="flex flex-col gap-14 sm:gap-16">
        <section
          aria-labelledby="home-title"
          className="overflow-hidden rounded-3xl border bg-card px-6 py-12 shadow-sm sm:px-12 sm:py-16"
        >
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold tracking-wide text-primary">SUPPLYMATE WHOLESALE</p>
            <h1 id="home-title" className="text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
              ของใช้ร้านอาหารและคาเฟ่ สั่งเป็นลัง ส่งตรงถึงร้าน
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              เลือกบรรจุภัณฑ์และอุปกรณ์หน้าร้าน พร้อมดูจำนวนต่อหน่วยและขั้นต่ำก่อนเพิ่มลงตะกร้า
            </p>
            <Link to="/shop" className="mt-8 inline-flex rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
              เลือกสินค้าตามหมวด
            </Link>
          </div>
        </section>

        <section aria-labelledby="category-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">หมวดสินค้า</p>
              <h2 id="category-title" className="mt-2 text-3xl font-semibold tracking-tight">
                เลือกของใช้ให้ตรงกับงานในร้าน
              </h2>
            </div>
            <Link to="/shop" className="text-sm font-medium text-primary hover:underline">
              ดูสินค้าทั้งหมด
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {demoCategories.map((category) => (
              <Link
                key={category.slug}
                to={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="rounded-2xl border bg-card p-5 font-semibold transition-colors hover:border-primary/50"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="featured-title" className="pb-8">
          <h2 id="featured-title" className="text-3xl font-semibold tracking-tight">
            สินค้าแนะนำจากแคตตาล็อก
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <section aria-labelledby="shop-title" className="pb-8">
      <p className="text-sm font-semibold text-primary">แคตตาล็อก</p>
      <h1 id="shop-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        เลือกสินค้าสำหรับร้านของคุณ
      </h1>
      <div className="mt-8 flex flex-col gap-5 rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="product-search" className="font-medium">
            ค้นหาสินค้า
          </label>
          <input
            id="product-search"
            type="search"
            value={query}
            onChange={(event) => updateFilter('query', event.target.value)}
            className="rounded-lg border bg-background px-3 py-2"
          />
        </div>
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

      {visibleProducts.length === 0 ? (
        <p className="mt-8 text-muted-foreground">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  )
}
