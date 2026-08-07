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
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-8 sm:gap-20 sm:py-12">
      <section
        aria-labelledby="home-title"
        className="overflow-hidden rounded-3xl border bg-card px-6 py-12 shadow-sm sm:px-12 sm:py-16"
      >
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold tracking-wide text-primary">
            SUPPLYMATE WHOLESALE
          </p>
          <h1
            id="home-title"
            className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl"
          >
            ของใช้ร้านอาหารและคาเฟ่ สั่งเป็นลัง ส่งตรงถึงร้าน
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
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
            <p className="text-sm font-semibold text-primary">หมวดสินค้า</p>
            <h2 id="category-title" className="mt-2 text-3xl font-semibold tracking-tight">
              เลือกของใช้ให้ตรงกับงานในร้าน
            </h2>
          </div>
          <Link to="/shop" className="text-sm font-medium text-primary hover:underline">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.data.map((category) => (
              <Link
                key={category.id}
                to={`/shop?category=${encodeURIComponent(category.slug)}`}
                className="group rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{category.name}</h3>
                    {category.description && (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="border-t pt-10">
          <h3 className="text-xl font-semibold">สินค้าแนะนำจากแคตตาล็อก</h3>
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
        <div className="grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-3">
          <div className="flex items-center gap-3 border-b p-5 sm:border-r sm:border-b-0">
            <PackageCheck aria-hidden="true" className="size-5 text-primary" />
            <p className="font-medium">ขั้นต่ำเริ่ม 1 ลัง</p>
          </div>
          <div className="flex items-center gap-3 border-b p-5 sm:border-r sm:border-b-0">
            <Banknote aria-hidden="true" className="size-5 text-primary" />
            <p className="font-medium">ชำระเงินด้วยการโอน</p>
          </div>
          <div className="flex items-center gap-3 p-5">
            <ClipboardCheck aria-hidden="true" className="size-5 text-primary" />
            <p className="font-medium">ติดตามสถานะหลังสั่งซื้อ</p>
          </div>
        </div>
      </section>
    </div>
  )
}
