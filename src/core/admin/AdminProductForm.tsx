import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slugify } from '@/lib/slugify'
import type { Database } from '@/lib/database.types'
import type { PackageUnit } from '@/lib/wholesale'
import { PRODUCT_STATUSES, productStatusLabel, type ProductStatus } from '@/lib/productStatus'
import type { ProductInput } from '@/core/admin/duplicateProduct'

type Category = Database['public']['Tables']['categories']['Row']
type Product = Database['public']['Tables']['products']['Row']

export function AdminProductForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Product
  categories: Category[]
  onSubmit: (input: ProductInput) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<ProductInput>({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? 0,
    compare_at_price: initial?.compare_at_price ?? null,
    sku: initial?.sku ?? null,
    stock_quantity: initial?.stock_quantity ?? 0,
    track_inventory: initial?.track_inventory ?? true,
    category_id: initial?.category_id ?? null,
    sort_order: initial?.sort_order ?? 0,
    status: (initial?.status as ProductStatus | undefined) ?? 'draft',
    package_unit: initial?.package_unit ?? 'carton',
    units_per_package: initial?.units_per_package ?? 1,
    min_order_quantity: initial?.min_order_quantity ?? 1,
  })

  function handleNameBlur() {
    if (!form.slug) {
      setForm((f) => ({ ...f, slug: slugify(f.name ?? '') }))
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onBlur={handleNameBlur}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          required
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="package_unit">หน่วยสั่งซื้อ</Label>
          <select
            id="package_unit"
            value={form.package_unit}
            onChange={(e) =>
              setForm((f) => ({ ...f, package_unit: e.target.value as PackageUnit }))
            }
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="carton">ลัง</option>
            <option value="pack">แพ็ก</option>
            <option value="roll">ม้วน</option>
            <option value="case">กล่อง</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="units_per_package">จำนวนต่อหน่วย</Label>
          <Input
            id="units_per_package"
            type="number"
            min={1}
            required
            value={form.units_per_package}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                units_per_package: Math.max(1, Number(e.target.value) || 1),
              }))
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="min_order_quantity">ขั้นต่ำต่อรายการ</Label>
          <Input
            id="min_order_quantity"
            type="number"
            min={1}
            required
            value={form.min_order_quantity}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                min_order_quantity: Math.max(1, Number(e.target.value) || 1),
              }))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">Price (THB)</Label>
          <Input
            id="price"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="compare_at_price">Compare-at price</Label>
          <Input
            id="compare_at_price"
            type="number"
            min={0}
            step="0.01"
            value={form.compare_at_price ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                compare_at_price: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            value={form.sku ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value || null }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="stock_quantity">Stock quantity</Label>
          <Input
            id="stock_quantity"
            type="number"
            min={0}
            value={form.stock_quantity ?? 0}
            onChange={(e) =>
              setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) || 0 }))
            }
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          value={form.category_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value || null }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sort_order">Sort order</Label>
        <Input
          id="sort_order"
          type="number"
          value={form.sort_order ?? 0}
          onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.track_inventory ?? true}
          onChange={(e) => setForm((f) => ({ ...f, track_inventory: e.target.checked }))}
        />
        Track inventory
      </label>
      <div className="flex flex-col gap-2">
        <Label htmlFor="status">สถานะ</Label>
        <select
          id="status"
          value={form.status ?? 'draft'}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {PRODUCT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {productStatusLabel(status)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          เฉพาะสถานะ "เปิดขาย" เท่านั้นที่ลูกค้าเห็นในหน้าร้าน
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save product'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
