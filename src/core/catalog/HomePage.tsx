import { ArrowRight, Banknote, ClipboardCheck, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/core/catalog/ProductCard'
import { useCategories } from '@/core/catalog/useCategories'
import { useProducts } from '@/core/catalog/useProducts'

export function HomePage() {
  const categories = useCategories()
  const products = useProducts({ page: 1, pageSize: 4 })

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:gap-16 sm:py-10">
      <section
        aria-labelledby="home-title"
        className="overflow-hidden rounded-md border border-border bg-card px-6 py-10 sm:px-10 sm:py-14"
      >
        <div className="max-w-3xl">
          <h1
            id="home-title"
            className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl"
          >
            ของใช้ร้านอาหารและคาเฟ่ สั่งเป็นลัง ส่งตรงถึงร้าน
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            เลือกบรรจุภัณฑ์และอุปกรณ์หน้าร้าน พร้อมดูจำนวนต่อหน่วยและขั้นต่ำก่อนสั่งซื้อ
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/shop">
              เลือกสินค้าตามหมวด
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="category-title" className="space-y-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">หมวดสินค้า</p>
            <h2 id="category-title" className="mt-1 text-[length:var(--text-app-section)] font-bold tracking-tight">
              เลือกของใช้ให้ตรงกับงานในร้าน
            </h2>
          </div>
          <Link to="/shop" className="text-sm font-semibold text-signal underline-offset-4 hover:underline">
            ดูสินค้าทั้งหมด
          </Link>
        </div>

        {categories.isLoading && (
          <p className="text-muted-foreground" role="status">
            กำลังโหลดหมวดสินค้า…
          </p>
        )}
        {categories.isError && (
          <p className="text-destructive" role="alert">
            โหลดหมวดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
          </p>
        )}
        {categories.data && categories.data.length === 0 && (
          <p className="text-muted-foreground">ยังไม่มีหมวดสินค้าที่เปิดจำหน่าย</p>
        )}
        {categories.data && categories.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-tour="home-categories">
            {categories.data.map((category) => (
              <Link
                key={category.id}
                to={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="group rounded-md border border-border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{category.name}</h3>
                    {category.description && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="border-t pt-10">
          <h3 className="text-[length:var(--text-app-section)] font-bold tracking-tight">สินค้าแนะนำจากแคตตาล็อก</h3>
          {products.isLoading && (
            <p className="mt-4 text-muted-foreground" role="status">
              กำลังโหลดสินค้า…
            </p>
          )}
          {products.isError && (
            <p className="mt-4 text-destructive" role="alert">
              โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
            </p>
          )}
          {products.data && products.data.products.length === 0 && (
            <p className="mt-4 text-muted-foreground">ยังไม่มีสินค้าที่เปิดจำหน่าย</p>
          )}
          {products.data && products.data.products.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {products.data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="operations-title" className="pb-8">
        <h2 id="operations-title" className="sr-only">
          ข้อมูลการสั่งซื้อ
        </h2>
        <div className="grid overflow-hidden rounded-md border border-border bg-card sm:grid-cols-3">
          <div className="flex items-center gap-3 border-b border-border p-4 sm:border-r sm:border-b-0">
            <PackageCheck aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-sm font-semibold">ขั้นต่ำเริ่ม 1 ลัง</p>
          </div>
          <div className="flex items-center gap-3 border-b border-border p-4 sm:border-r sm:border-b-0">
            <Banknote aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-sm font-semibold">ชำระเงินด้วยการโอน</p>
          </div>
          <div className="flex items-center gap-3 p-4">
            <ClipboardCheck aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-sm font-semibold">ติดตามสถานะหลังสั่งซื้อ</p>
          </div>
        </div>
      </section>
    </div>
  )
}
