import { useState, type FormEvent } from 'react'
import { useProductVariants } from '@/modules/optional/variants/useProductVariants'
import { useVariantMutations } from '@/modules/optional/variants/useVariantMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPrice } from '@/lib/formatPrice'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

interface VariantFormInput {
  name: string
  sku: string | null
  price_override: number | null
  stock_quantity: number
  is_active: boolean
}

function emptyForm(initial?: Variant): VariantFormInput {
  return {
    name: initial?.name ?? '',
    sku: initial?.sku ?? null,
    price_override: initial?.price_override ?? null,
    stock_quantity: initial?.stock_quantity ?? 0,
    is_active: initial?.is_active ?? true,
  }
}

export default function VariantsPanel({ productId }: { productId: string }) {
  const { data: variants, isLoading, isError } = useProductVariants(productId)
  const { createVariant, updateVariant } = useVariantMutations(productId)
  const [editing, setEditing] = useState<Variant | 'new' | null>(null)
  const [form, setForm] = useState<VariantFormInput>(emptyForm())
  const [error, setError] = useState<string | null>(null)

  function startEdit(variant: Variant | 'new') {
    setError(null)
    setForm(emptyForm(variant === 'new' ? undefined : variant))
    setEditing(variant)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing === 'new') {
        await createVariant.mutateAsync(form)
      } else if (editing) {
        await updateVariant.mutateAsync({ id: editing.id, ...form })
      }
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">ตัวเลือกสินค้า</h2>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            onClick={() => startEdit('new')}
          >
            เพิ่มตัวเลือก
          </Button>
        )}
      </div>

      {isLoading && <Skeleton className="h-20 w-full" />}

      {/* Not the same as "no variants yet": an owner reading a failed load as
          empty would add a duplicate option. */}
      {isError && (
        <Alert tone="error" title="โหลดตัวเลือกไม่สำเร็จ">
          ลองรีเฟรชก่อน อย่าเพิ่งเพิ่มใหม่ — ตัวเลือกเดิมอาจยังอยู่
        </Alert>
      )}

      {!editing && !isLoading && !isError && variants?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีตัวเลือก — ลูกค้าจะสั่งสินค้านี้ได้ตรง ๆ โดยไม่ต้องเลือกอะไร
        </p>
      )}

      {!editing && variants && variants.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {variants.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {v.name}
                  {!v.is_active && <Badge>ปิดใช้งาน</Badge>}
                </p>
                <p className="mt-0.5 tabular-nums text-muted-foreground">
                  {v.price_override != null ? formatPrice(v.price_override) : 'ใช้ราคาหลัก'} ·
                  คงเหลือ {v.stock_quantity}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                onClick={() => startEdit(v)}
              >
                แก้ไข
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
        >
          <Field label="ชื่อตัวเลือก" hint="เช่น ขนาด สี หรือความหนา" required>
            <Input
              id="variant-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="เช่น 16 ออนซ์"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รหัสสินค้า (SKU)">
              <Input
                id="variant-sku"
                value={form.sku ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value || null }))}
              />
            </Field>
            <Field label="ราคาเฉพาะตัวเลือกนี้" hint="เว้นว่าง = ใช้ราคาหลักของสินค้า">
              <Input
                id="variant-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price_override ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    price_override: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </Field>
          </div>
          <Field label="จำนวนคงเหลือ">
            <Input
              id="variant-stock"
              type="number"
              min={0}
              value={form.stock_quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) || 0 }))
              }
            />
          </Field>
          <Checkbox
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          >
            เปิดให้สั่งซื้อ
          </Checkbox>
          {error && <Alert tone="error" title="บันทึกตัวเลือกไม่สำเร็จ">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={createVariant.isPending || updateVariant.isPending}>
              {createVariant.isPending || updateVariant.isPending ? 'กำลังบันทึก' : 'บันทึกตัวเลือก'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
