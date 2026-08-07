import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCategories } from '@/core/catalog/useCategories'
import { useProducts } from '@/core/catalog/useProducts'
import { ProductCard } from '@/core/catalog/ProductCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 12

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categorySlug = searchParams.get('category') ?? undefined
  const search = searchParams.get('q') ?? undefined
  const page = Number(searchParams.get('page') ?? '1')

  const [searchInput, setSearchInput] = useState(search ?? '')

  useEffect(() => {
    setSearchInput(search ?? '')
  }, [search])

  const { data: categories } = useCategories()
  const categoriesResolved = categories !== undefined
  const activeCategory = categories?.find((c) => c.slug === categorySlug)
  // While a categorySlug is present but categories haven't loaded yet, we don't
  // know whether it matches a real category — don't run the products query
  // unfiltered in the meantime (it would flash the full catalog).
  const categoryPending = !!categorySlug && !categoriesResolved
  const categoryNotFound = !!categorySlug && categoriesResolved && !activeCategory
  const productsEnabled = !categorySlug || !!activeCategory

  const { data, isLoading, isError } = useProducts({
    categoryId: activeCategory?.id,
    search,
    page,
    pageSize: PAGE_SIZE,
    enabled: productsEnabled,
  })

  const showLoading = categoryPending || isLoading

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    setSearchParams(params)
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    updateParams({ q: searchInput || undefined, page: undefined })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <Input
          type="search"
          aria-label="ค้นหาสินค้า"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="ค้นหาชื่อสินค้า…"
        />
        <Button type="submit">ค้นหา</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateParams({ category: undefined, page: undefined })}
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            !categorySlug ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          ทุกหมวด
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => updateParams({ category: cat.slug, page: undefined })}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              categorySlug === cat.slug ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {showLoading && <p className="text-muted-foreground">กำลังโหลดสินค้า…</p>}
      {isError && <p className="text-destructive">โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>}
      {categoryNotFound && (
        <p className="text-muted-foreground">
          ไม่พบหมวดสินค้านี้{' '}
          <Link to="/shop" className="underline">
            ดูสินค้าทั้งหมด
          </Link>
        </p>
      )}
      {!categoryNotFound && data && data.products.length === 0 && (
        <p className="text-muted-foreground">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
      )}

      {!categoryNotFound && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {data?.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {!categoryNotFound && data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            ก่อนหน้า
          </Button>
          <span className="text-sm text-muted-foreground">
            หน้า {page} จาก {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            ถัดไป
          </Button>
        </div>
      )}
    </div>
  )
}
