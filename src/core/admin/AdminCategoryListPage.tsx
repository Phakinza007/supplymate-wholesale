import { useState } from 'react'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminCategoryMutations } from '@/core/admin/useAdminCategoryMutations'
import { AdminCategoryForm } from '@/core/admin/AdminCategoryForm'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['categories']['Row']

export function AdminCategoryListPage() {
  const { data: categories, isLoading, isError } = useAdminCategories()
  const { createCategory, updateCategory } = useAdminCategoryMutations()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError) return <p className="p-8 text-destructive">Failed to load categories.</p>

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto max-w-lg px-4 pb-8">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'New category' : 'Edit category'}
        </h1>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <AdminCategoryForm
          initial={initial}
          categories={categories ?? []}
          submitting={createCategory.isPending || updateCategory.isPending}
          onCancel={() => {
            setEditing(null)
            setError(null)
          }}
          onSubmit={async (input) => {
            setError(null)
            try {
              if (editing === 'new') {
                await createCategory.mutateAsync(input)
              } else {
                await updateCategory.mutateAsync({ id: editing.id, ...input })
              }
              setEditing(null)
            } catch (err) {
              setError(getErrorMessage(err, 'Failed to save category.'))
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          New category
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {categories?.map((category) => (
          <li
            key={category.id}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {category.name}
                {!category.is_active && (
                  <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                )}
              </p>
              <p className="text-muted-foreground">/{category.slug}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(category)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
