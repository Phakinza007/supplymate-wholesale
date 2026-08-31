import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { slugify } from '@/lib/slugify'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['categories']['Row']
type CategoryInput = Omit<
  Database['public']['Tables']['categories']['Insert'],
  'id' | 'created_at' | 'updated_at'
>

export function AdminCategoryForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Category
  categories: Category[]
  onSubmit: (input: CategoryInput) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<CategoryInput>({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    parent_id: initial?.parent_id ?? null,
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  })

  function field(key: 'name' | 'slug' | 'description') {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

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
      <Field label="ชื่อหมวด" required>
        <Input id="name" required {...field('name')} onBlur={handleNameBlur} />
      </Field>
      <Field label="Slug" hint="ใช้ใน URL — เว้นว่างไว้จะสร้างจากชื่อให้อัตโนมัติ" required>
        <Input id="slug" required {...field('slug')} />
      </Field>
      <Field label="คำอธิบาย">
        <Textarea id="description" {...field('description')} />
      </Field>
      <Field label="หมวดแม่">
        <Select
          id="parent"
          value={form.parent_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value || null }))}
        >
          <option value="">ไม่มี</option>
          {categories
            .filter((c) => c.id !== initial?.id)
            .map((c) => (
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
        checked={form.is_active ?? true}
        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
      >
        แสดงในหน้าร้าน
      </Checkbox>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting}>
          {submitting ? 'กำลังบันทึก' : 'บันทึกหมวด'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
