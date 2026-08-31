import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminProducts } from '@/core/admin/useAdminProducts'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminProductMutations } from '@/core/admin/useAdminProductMutations'
import { AdminProductForm } from '@/core/admin/AdminProductForm'
import { ProductImagesPanel } from '@/core/admin/ProductImagesPanel'
import { ProductPriceTiersPanel } from '@/core/admin/ProductPriceTiersPanel'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Feature } from '@/lib/Feature'
import { PRODUCT_STATUSES, productStatusLabel, type ProductStatus } from '@/lib/productStatus'
import { formatPackageLabel, quantityLabel, type PackageUnit } from '@/lib/wholesale'
import type { Database } from '@/lib/database.types'

const VariantsPanel = lazy(() => import('@/modules/optional/variants/VariantsPanel'))

type Product = Database['public']['Tables']['products']['Row']

export function AdminProductListPage() {
  const { data: products, isLoading, isError } = useAdminProducts()
  const { data: categories } = useAdminCategories()
  const { createProduct, updateProduct, duplicateProduct } = useAdminProductMutations()
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 'current' is the default view and hides archived rows, matching Shopify,
  // where archived products are removed from the admin list.
  const [statusFilter, setStatusFilter] = useState<'current' | 'all' | ProductStatus>('current')

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError) return <p className="p-8 text-destructive">Failed to load products.</p>

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-4 pb-8">
        <div>
          <h1 className="mb-6 text-2xl font-semibold">
            {editing === 'new' ? 'New product' : 'Edit product'}
          </h1>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          <AdminProductForm
            initial={initial}
            categories={categories ?? []}
            submitting={createProduct.isPending || updateProduct.isPending}
            onCancel={() => {
              setEditing(null)
              setError(null)
            }}
            onSubmit={async (input) => {
              setError(null)
              try {
                if (editing === 'new') {
                  const created = await createProduct.mutateAsync(input)
                  setEditing(created)
                } else {
                  await updateProduct.mutateAsync({ id: editing.id, ...input })
                  setEditing(null)
                }
              } catch (err) {
                setError(getErrorMessage(err, 'Failed to save product.'))
              }
            }}
          />
        </div>
        {editing !== 'new' && editing.status === 'draft' && (
          <p className="text-sm text-muted-foreground">
            สำเนาสินค้าไม่ได้คัดลอกรูปภาพมาด้วย — กรุณาอัปโหลดรูปใหม่ก่อนเปลี่ยนสถานะเป็น "เปิดขาย"
          </p>
        )}
        {editing !== 'new' && <ProductImagesPanel productId={editing.id} />}
        {editing !== 'new' && <ProductPriceTiersPanel productId={editing.id} />}
        {editing !== 'new' && (
          <Feature flag="variants">
            <Suspense fallback={null}>
              <VariantsPanel productId={editing.id} />
            </Suspense>
          </Feature>
        )}
      </div>
    )
  }

  const visibleProducts = (products ?? []).filter((product) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'current') return product.status !== 'archived'
    return product.status === statusFilter
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/products/import">นำเข้า CSV</Link>
          </Button>
          <Button size="sm" onClick={() => setEditing('new')}>
            New product
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['current', 'all', ...PRODUCT_STATUSES] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={
              'rounded-full border px-3 py-1 text-xs ' +
              (statusFilter === filter
                ? 'border-foreground font-medium'
                : 'border-input text-muted-foreground hover:text-foreground')
            }
          >
            {filter === 'current'
              ? 'กำลังใช้งาน'
              : filter === 'all'
                ? 'ทั้งหมด'
                : productStatusLabel(filter)}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="flex flex-col gap-2">
        {visibleProducts.map((product) => {
          const packageUnit = product.package_unit as PackageUnit

          return (
            <li
              key={product.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {product.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({productStatusLabel(product.status)})
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {product.categories?.name ?? 'Uncategorized'} · {formatPrice(product.price)}
                </p>
                <p className="text-muted-foreground">
                  {formatPackageLabel(packageUnit, product.units_per_package)} · ขั้นต่ำ{' '}
                  {quantityLabel(packageUnit, product.min_order_quantity)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(product)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={duplicateProduct.isPending}
                  onClick={async () => {
                    setError(null)
                    try {
                      setEditing(await duplicateProduct.mutateAsync(product))
                    } catch (err) {
                      setError(getErrorMessage(err, 'Failed to duplicate product.'))
                    }
                  }}
                >
                  ทำซ้ำ
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
