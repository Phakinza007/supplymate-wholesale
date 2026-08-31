import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
      <Field label="ชื่อสินค้า" required>
        <Input
          id="name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onBlur={handleNameBlur}
        />
      </Field>
      <Field label="Slug" hint="ใช้ใน URL — เว้นว่างไว้จะสร้างจากชื่อให้อัตโนมัติ" required>
        <Input
          id="slug"
          required
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
        />
      </Field>
      <Field label="รายละเอียด">
        <Textarea
          id="description"
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="หน่วยสั่งซื้อ">
          <Select
            id="package_unit"
            value={form.package_unit}
            onChange={(e) =>
              setForm((f) => ({ ...f, package_unit: e.target.value as PackageUnit }))
            }
          >
            <option value="carton">ลัง</option>
            <option value="pack">แพ็ก</option>
            <option value="roll">ม้วน</option>
            <option value="case">กล่อง</option>
          </Select>
        </Field>
        <Field label="จำนวนต่อหน่วย" required>
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
        </Field>
        <Field label="ขั้นต่ำต่อรายการ" required>
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
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ราคาต่อหน่วยสั่งซื้อ" hint="ราคาก่อนภาษี" required>
          <Input
            id="price"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
          />
        </Field>
        <Field label="ราคาก่อนลด" hint="แสดงขีดฆ่าคู่กับราคาขาย เว้นว่างได้">
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
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="รหัสสินค้า (SKU)">
          <Input
            id="sku"
            value={form.sku ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value || null }))}
          />
        </Field>
        <Field label="จำนวนคงเหลือ">
          <Input
            id="stock_quantity"
            type="number"
            min={0}
            value={form.stock_quantity ?? 0}
            onChange={(e) =>
              setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) || 0 }))
            }
          />
        </Field>
      </div>
      <Field label="หมวดสินค้า">
        <Select
          id="category"
          value={form.category_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value || null }))}
        >
          <option value="">ไม่ระบุ</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ลำดับการแสดง" hint="ตัวเลขน้อยมาก่อน">
        <Input
          id="sort_order"
          type="number"
          value={form.sort_order ?? 0}
          onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
        />
      </Field>
      <Checkbox
        checked={form.track_inventory ?? true}
        onChange={(e) => setForm((f) => ({ ...f, track_inventory: e.target.checked }))}
      >
        ตัดสต๊อกอัตโนมัติ
      </Checkbox>
      <Field label="สถานะ" hint={'เฉพาะสถานะ "เปิดขาย" เท่านั้นที่ลูกค้าเห็นในหน้าร้าน'}>
        <Select
          id="status"
          value={form.status ?? 'draft'}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))}
        >
          {PRODUCT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {productStatusLabel(status)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting}>
          {submitting ? 'กำลังบันทึก' : 'บันทึกสินค้า'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
