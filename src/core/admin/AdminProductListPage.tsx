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
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Feature } from '@/lib/Feature'
import { PRODUCT_STATUSES, productStatusLabel, type ProductStatus } from '@/lib/productStatus'
import { ProductStatusControl } from '@/core/admin/ProductStatusControl'
import { unitNoun, type PackageUnit } from '@/lib/wholesale'
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8 md:px-0">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  // Distinct from an empty catalogue on purpose: an owner who reads a failed
  // load as "no products" would re-create rows that already exist.
  if (isError) {
    return (
      <div className="px-4 pb-8 md:px-0">
        <Alert tone="error" title="โหลดสินค้าไม่สำเร็จ">
          ลองรีเฟรชอีกครั้ง อย่าเพิ่งสร้างสินค้าใหม่ — ของเดิมอาจยังอยู่
        </Alert>
      </div>
    )
  }

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-4 pb-8">
        <div>
          <h1 className="mb-6 text-[length:var(--text-app-title)] font-bold tracking-tight">
            {editing === 'new' ? 'เพิ่มสินค้า' : 'แก้ไขสินค้า'}
          </h1>
          {error && (
            <Alert tone="error" title="บันทึกสินค้าไม่สำเร็จ" className="mb-4">
              {error}
            </Alert>
          )}
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

  const counts = {
    all: (products ?? []).length,
    active: (products ?? []).filter((p) => p.status === 'active').length,
    draft: (products ?? []).filter((p) => p.status === 'draft').length,
    archived: (products ?? []).filter((p) => p.status === 'archived').length,
  }
  const visibleProducts = (products ?? []).filter((product) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'current') return product.status !== 'archived'
    return product.status === statusFilter
  })
  const filters = [
    { key: 'current' as const, label: 'กำลังใช้งาน', count: counts.active + counts.draft },
    { key: 'all' as const, label: 'ทั้งหมด', count: counts.all },
    ...PRODUCT_STATUSES.map((status) => ({
      key: status,
      label: productStatusLabel(status),
      count: counts[status],
    })),
  ]

  async function changeStatus(product: Product, status: ProductStatus) {
    setError(null)
    try {
      await updateProduct.mutateAsync({ id: product.id, status })
    } catch (err) {
      setError(getErrorMessage(err, 'เปลี่ยนสถานะสินค้าไม่สำเร็จ'))
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--text-section-title)] font-bold tracking-tight">
            สินค้าทั้งหมด
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {counts.all} รายการ · แสดงหน้าร้าน {counts.active} · ฉบับร่าง {counts.draft} · เก็บถาวร{' '}
            {counts.archived}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/products/import">นำเข้า CSV</Link>
          </Button>
          <Button size="sm" onClick={() => setEditing('new')}>
            + เพิ่มสินค้า
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={statusFilter === filter.key}
            onClick={() => setStatusFilter(filter.key)}
            className={
              'rounded-md border px-3 py-2 text-xs font-medium tabular-nums transition-colors ' +
              (statusFilter === filter.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground')
            }
          >
            {filter.label} {filter.count}
          </button>
        ))}
      </div>

      {error && <Alert tone="error" title="ดำเนินการไม่สำเร็จ">{error}</Alert>}

      {visibleProducts.length === 0 ? (
        <EmptyState
          title="ไม่มีสินค้าในสถานะนี้"
          description="ลองเลือกตัวกรองอื่น หรือเพิ่มสินค้าใหม่"
        />
      ) : (
        <Table stickyHeader className="min-w-[46rem]">
          <TableHeader>
            <TableRow>
              <TableHead>สินค้า</TableHead>
              <TableHead>หน่วย</TableHead>
              <TableHead>ราคา / ขั้น</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
              {visibleProducts.map((product) => {
                const packageUnit = product.package_unit as PackageUnit
                const tierCount = product.product_price_tiers?.[0]?.count ?? 0
                const archived = product.status === 'archived'

                return (
                  <TableRow key={product.id} className={archived ? 'opacity-60' : undefined}>
                    <TableCell>
                      <p className={'font-semibold ' + (archived ? 'line-through' : '')}>
                        {product.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {product.sku ?? 'ไม่มี SKU'} · {product.categories?.name ?? 'ไม่มีหมวดหมู่'}
                      </p>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {unitNoun(packageUnit)}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {product.units_per_package.toLocaleString('th-TH')} ชิ้น
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {formatPrice(product.price)}
                      <span
                        className={
                          'mt-0.5 block text-xs font-normal ' +
                          (tierCount > 0
                            ? 'text-[var(--price-per-unit)]'
                            : 'text-[var(--status-pending)]')
                        }
                      >
                        {tierCount > 0 ? `${tierCount} ขั้น` : 'ยังไม่มีขั้น'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ProductStatusControl
                        value={product.status}
                        productName={product.name}
                        disabled={updateProduct.isPending}
                        onChange={(status) => changeStatus(product, status)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(product)}>
                          แก้ไข
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
                              setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
                            }
                          }}
                        >
                          ทำซ้ำ
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      )}

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <div>
          <dt className="inline font-semibold text-[var(--status-pending)]">ร่าง</dt>{' '}
          <dd className="inline">— ไม่แสดงหน้าร้าน แก้ไขได้</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-[var(--status-verified)]">แสดง</dt>{' '}
          <dd className="inline">— ขายได้ตามปกติ</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-[var(--status-done)]">เก็บ</dt>{' '}
          <dd className="inline">— ซ่อนจากหน้าร้าน แต่ยังอยู่ในบิลเก่า</dd>
        </div>
      </dl>
    </div>
  )
}
