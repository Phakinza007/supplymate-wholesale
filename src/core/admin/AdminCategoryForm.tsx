import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required {...field('name')} onBlur={handleNameBlur} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" required {...field('slug')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" {...field('description')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="parent">Parent category</Label>
        <select
          id="parent"
          value={form.parent_id ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value || null }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">None</option>
          {categories
            .filter((c) => c.id !== initial?.id)
            .map((c) => (
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
          checked={form.is_active ?? true}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        Active (visible in the storefront)
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save category'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
