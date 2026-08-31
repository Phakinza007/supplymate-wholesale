import { useState, type FormEvent } from 'react'
import { useAdminPromotions } from '@/modules/optional/promotions/useAdminPromotions'
import { useAdminPromotionMutations } from '@/modules/optional/promotions/useAdminPromotionMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import type { Database } from '@/lib/database.types'

type Promotion = Database['public']['Tables']['promotions']['Row']

interface PromotionFormInput {
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  min_subtotal: number | null
  max_uses: number | null
  expires_at: string | null
  is_active: boolean
}

function emptyForm(initial?: Promotion): PromotionFormInput {
  return {
    code: initial?.code ?? '',
    discount_type: (initial?.discount_type as 'percent' | 'fixed' | undefined) ?? 'percent',
    discount_value: initial?.discount_value ?? 10,
    min_subtotal: initial?.min_subtotal ?? null,
    max_uses: initial?.max_uses ?? null,
    expires_at: initial?.expires_at ? initial.expires_at.slice(0, 10) : null,
    is_active: initial?.is_active ?? true,
  }
}

export default function PromotionsAdminPage() {
  const { data: promotions, isLoading, isError } = useAdminPromotions()
  const { createPromotion, updatePromotion } = useAdminPromotionMutations()
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const [form, setForm] = useState<PromotionFormInput>(emptyForm())
  const [error, setError] = useState<string | null>(null)

  function startEdit(promotion: Promotion | 'new') {
    setError(null)
    setForm(emptyForm(promotion === 'new' ? undefined : promotion))
    setEditing(promotion)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      ...form,
      expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null,
    }
    try {
      if (editing === 'new') {
        await createPromotion.mutateAsync(payload)
      } else if (editing) {
        await updatePromotion.mutateAsync({ id: editing.id, ...payload })
      }
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-8 md:px-0">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  // Distinct from "no promotions yet": an owner reading a failed load as empty
  // would re-create a code that already exists and hit a unique violation.
  if (isError) {
    return (
      <div className="px-4 pb-8 md:px-0">
        <Alert tone="error" title="โหลดโปรโมชันไม่สำเร็จ">
          ลองรีเฟรชอีกครั้ง อย่าเพิ่งสร้างโค้ดใหม่ — ของเดิมอาจยังอยู่
        </Alert>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="flex max-w-lg flex-col gap-6 px-4 pb-8 md:px-0">
        <PageHeader title={editing === 'new' ? 'เพิ่มโปรโมชัน' : 'แก้ไขโปรโมชัน'} />
        {error && <Alert tone="error" title="บันทึกโปรโมชันไม่สำเร็จ">{error}</Alert>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="โค้ด" hint="ลูกค้าพิมพ์โค้ดนี้ตอนชำระเงิน" required>
            <Input
              id="promo-code"
              required
              className="font-mono"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รูปแบบส่วนลด">
              <Select
                id="promo-type"
                value={form.discount_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))
                }
              >
                <option value="percent">ลดเป็นเปอร์เซ็นต์</option>
                <option value="fixed">ลดเป็นจำนวนเงิน</option>
              </Select>
            </Field>
            <Field
              label={form.discount_type === 'percent' ? 'ลดกี่เปอร์เซ็นต์' : 'ลดกี่บาท'}
              required
            >
              <Input
                id="promo-value"
                type="number"
                min={0}
                max={form.discount_type === 'percent' ? 100 : undefined}
                step={form.discount_type === 'percent' ? 1 : 0.01}
                required
                value={form.discount_value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ยอดขั้นต่ำ" hint="เว้นว่างได้">
              <Input
                id="promo-min-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={form.min_subtotal ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    min_subtotal: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="ใช้ได้สูงสุดกี่ครั้ง" hint="เว้นว่าง = ไม่จำกัด">
              <Input
                id="promo-max-uses"
                type="number"
                min={1}
                value={form.max_uses ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_uses: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </Field>
          </div>
          <Field label="ใช้ได้ถึงสิ้นวันที่" hint="เว้นว่าง = ไม่มีวันหมดอายุ">
            <Input
              id="promo-expires"
              type="date"
              value={form.expires_at ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value || null }))}
            />
          </Field>
          <Checkbox
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          >
            เปิดใช้งาน
          </Checkbox>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={createPromotion.isPending || updatePromotion.isPending}>
              {createPromotion.isPending || updatePromotion.isPending
                ? 'กำลังบันทึก'
                : 'บันทึกโปรโมชัน'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              ยกเลิก
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8 md:px-0">
      <PageHeader
        title="โปรโมชัน"
        description="โค้ดส่วนลดที่ลูกค้าใช้ได้ตอนชำระเงิน"
        // Hidden while empty: the empty state carries the same action, under
        // the same label, so nothing is ambiguous either way.
        action={
          promotions && promotions.length > 0 ? (
            <Button onClick={() => startEdit('new')}>เพิ่มโปรโมชัน</Button>
          ) : undefined
        }
      />

      {promotions?.length === 0 && (
        <EmptyState
          title="ยังไม่มีโปรโมชัน"
          description="สร้างโค้ดส่วนลดให้ลูกค้ากรอกตอนชำระเงิน กำหนดยอดขั้นต่ำและจำนวนครั้งที่ใช้ได้"
          action={<Button onClick={() => startEdit('new')}>เพิ่มโปรโมชัน</Button>}
        />
      )}

      {promotions && promotions.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {promotions.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{p.code}</span>
                  {!p.is_active && <Badge>ปิดใช้งาน</Badge>}
                </p>
                <p className="mt-0.5 tabular-nums text-muted-foreground">
                  {p.discount_type === 'percent'
                    ? `ลด ${p.discount_value}%`
                    : `ลด ${formatPrice(p.discount_value)}`}
                  {' · '}ใช้ไปแล้ว {p.uses_count}
                  {p.max_uses ? `/${p.max_uses}` : ''} ครั้ง
                  {p.expires_at &&
                    ` · ถึง ${new Date(p.expires_at).toLocaleDateString('th-TH')}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                onClick={() => startEdit(p)}
              >
                แก้ไข
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
