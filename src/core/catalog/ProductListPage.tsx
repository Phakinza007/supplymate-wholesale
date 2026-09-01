import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCategories } from '@/core/catalog/useCategories'
import { PRODUCT_SORTS, useProducts, type ProductSort } from '@/core/catalog/useProducts'
import { SearchSuggestions } from '@/core/catalog/SearchSuggestions'
import { ProductCard } from '@/core/catalog/ProductCard'
import { ProductTable } from '@/core/catalog/ProductTable'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'

const CHIP =
  'min-h-11 rounded-full border border-border px-3 text-sm font-semibold transition-colors sm:min-h-9'

// The grid is for browsing, so a short page keeps the drawings large. The
// table exists to be read down a column; splitting that across three pages
// reintroduces exactly the re-reading it removes, so it carries the whole
// catalogue in one scroll.
const GRID_PAGE_SIZE = 12
const TABLE_PAGE_SIZE = 48

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categorySlug = searchParams.get('category') ?? undefined
  const search = searchParams.get('q') ?? undefined
  const page = Number(searchParams.get('page') ?? '1')
  const sort = (searchParams.get('sort') ?? 'default') as ProductSort
  const tieredOnly = searchParams.get('tiered') === '1'
  // In the URL like every other catalogue control, so a buyer can send a
  // colleague the comparison they are actually looking at.
  const view = searchParams.get('view') === 'table' ? 'table' : 'grid'
  const pageSize = view === 'table' ? TABLE_PAGE_SIZE : GRID_PAGE_SIZE

  const [searchInput, setSearchInput] = useState(search ?? '')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

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
    sort,
    tieredOnly,
    page,
    pageSize,
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

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / pageSize)) : 1

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <PageHeader
        title="แคตตาล็อกสินค้า"
        description="ค้นหาและกรองตามหมวด ตัวเลือกจะถูกจดจำไว้ใน URL เมื่อแชร์หรือย้อนกลับ"
      />

      {/* One toolbar: search, categories and the result state together, so the
          products stay in the first screen instead of below a filter panel. */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
        <form onSubmit={handleSearchSubmit} data-tour="catalogue-search" className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="search"
              aria-label="ค้นหาสินค้า"
              autoComplete="off"
              // ARIA 1.2 combobox: an input that owns a suggestion listbox
              // takes role="combobox", which replaces the implicit searchbox
              // role. aria-autocomplete says the popup narrows as you type.
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
              aria-controls="search-suggestions"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setSuggestionsOpen(true)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              // Blur is deferred so a click on a suggestion lands before the
              // list unmounts out from under the pointer.
              onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={(e) => e.key === 'Escape' && setSuggestionsOpen(false)}
              placeholder="ค้นหาชื่อสินค้า"
            />
            {suggestionsOpen && (
              <div id="search-suggestions">
                <SearchSuggestions
                  query={searchInput}
                  onDismiss={() => setSuggestionsOpen(false)}
                  onRefine={(next) => {
                    setSuggestionsOpen(false)
                    updateParams({ ...next, page: undefined })
                  }}
                />
              </div>
            )}
          </div>
          <Button type="submit">ค้นหา</Button>
        </form>

        <div role="group" aria-label="เลือกหมวดสินค้า" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!categorySlug}
            onClick={() => updateParams({ category: undefined, page: undefined })}
            className={cn(CHIP, !categorySlug ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >
            ทุกหมวด
          </button>
          {categories?.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={categorySlug === cat.slug}
              onClick={() => updateParams({ category: cat.slug, page: undefined })}
              className={cn(
                CHIP,
                categorySlug === cat.slug
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Sorting by price-per-piece is the comparison a wholesale buyer
            actually makes, so it sits beside the categories rather than behind
            a menu. */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="เรียงลำดับ" className="flex flex-wrap gap-2">
            {PRODUCT_SORTS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sort === option.value}
                onClick={() =>
                  updateParams({
                    sort: option.value === 'default' ? undefined : option.value,
                    page: undefined,
                  })
                }
                className={cn(
                  CHIP,
                  sort === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={tieredOnly}
            onClick={() => updateParams({ tiered: tieredOnly ? undefined : '1', page: undefined })}
            className={cn(
              CHIP,
              tieredOnly
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent',
            )}
          >
            มีราคาขั้นบันได
          </button>

          {/* Deliberately NOT a chip. Every pill in this toolbar changes WHICH
              products are listed; this changes HOW they are drawn. Sharing the
              chip's shape and active treatment made the two indistinguishable,
              so the view control is a segmented control with its own shape and
              a visible label.

              Cards stay the default: the drawings are worth showing to someone
              still browsing. The table is for the buyer who has started
              comparing. Switching resets the page, because the two views
              paginate at different sizes. */}
          <div className="ms-auto flex items-center gap-2">
            <span id="view-label" className="text-xs font-semibold text-muted-foreground">
              มุมมอง
            </span>
            <div
              role="group"
              aria-labelledby="view-label"
              className="inline-flex overflow-hidden rounded-md border border-input"
            >
              {(
                [
                  { value: 'grid', label: 'การ์ด' },
                  { value: 'table', label: 'ตารางเทียบราคา' },
                ] as const
              ).map((option, i) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() =>
                    updateParams({
                      view: option.value === 'grid' ? undefined : option.value,
                      page: undefined,
                    })
                  }
                  className={cn(
                    'min-h-11 px-3 text-sm font-semibold transition-colors sm:min-h-9',
                    i > 0 && 'border-l border-input',
                    view === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {data && !categoryNotFound && (
          <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
            พบสินค้า {data.totalCount.toLocaleString('th-TH')} รายการ
          </p>
        )}
      </div>

      {/* A skeleton exists to prefigure the layout about to replace it. Showing
          card blocks and then rendering a table is the one thing it must not
          do. */}
      {showLoading &&
        (view === 'table' ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((card) => (
              <Skeleton key={card} className="h-72 w-full" />
            ))}
          </div>
        ))}

      {/* Distinct from "no results": a failed query must never read as an empty
          catalogue. */}
      {isError && (
        <Alert tone="error" title="โหลดสินค้าไม่สำเร็จ">
          ลองรีเฟรชอีกครั้ง รายการนี้ไม่ใช่แคตตาล็อกทั้งหมดของร้าน
        </Alert>
      )}

      {categoryNotFound && (
        <EmptyState
          title="ไม่พบหมวดสินค้านี้"
          description="ลิงก์อาจเก่าหรือหมวดถูกปิดไปแล้ว"
          action={
            <Button asChild variant="outline">
              <Link to="/shop">ดูสินค้าทั้งหมด</Link>
            </Button>
          }
        />
      )}

      {!showLoading && !isError && !categoryNotFound && data && data.products.length === 0 && (
        <EmptyState
          title="ไม่พบสินค้าที่ตรงกับการค้นหา"
          description="ลองใช้คำค้นที่สั้นลง หรือเลือกดูทุกหมวด"
          action={
            <Button
              variant="outline"
              onClick={() => updateParams({ q: undefined, category: undefined, page: undefined })}
            >
              ล้างตัวกรอง
            </Button>
          }
        />
      )}

      {/* The card titles are h3, so without this the outline jumps h1 -> h3 and
          a screen-reader user browsing by heading cannot tell where the
          listing begins. Visually hidden: sighted users already have the
          toolbar and the result count as the boundary. */}
      {!showLoading && !categoryNotFound && data && data.products.length > 0 && (
        <section aria-labelledby="product-results-heading">
          <h2 id="product-results-heading" className="sr-only">
            รายการสินค้า
          </h2>
          {view === 'table' ? (
            <ProductTable products={data.products} />
          ) : (
            <div className="animate-in fade-in duration-150 motion-reduce:animate-none grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      )}

      {!categoryNotFound && data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            ก่อนหน้า
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            หน้า {page} จาก {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
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
