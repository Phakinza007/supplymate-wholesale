import { useState } from 'react'
import { FolderTree } from 'lucide-react'
import { useAdminCategories } from '@/core/admin/useAdminCategories'
import { useAdminCategoryMutations } from '@/core/admin/useAdminCategoryMutations'
import { AdminCategoryForm } from '@/core/admin/AdminCategoryForm'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import type { Database } from '@/lib/database.types'

type Category = Database['public']['Tables']['categories']['Row']

export function AdminCategoryListPage() {
  const { data: categories, isLoading, isError } = useAdminCategories()
  const { createCategory, updateCategory } = useAdminCategoryMutations()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="flex max-w-lg flex-col gap-6 px-4 pb-8 md:px-0">
        <PageHeader title={editing === 'new' ? 'เพิ่มหมวดสินค้า' : 'แก้ไขหมวดสินค้า'} />
        {error && <Alert tone="error" title="บันทึกหมวดไม่สำเร็จ">{error}</Alert>}
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
              setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 px-4 pb-8 md:px-0">
      <PageHeader
        title="หมวดสินค้า"
        description="จัดกลุ่มสินค้าให้ลูกค้าหาเจอ — ปิดการแสดงได้โดยไม่ต้องลบ"
        // Hidden while the list is empty: the empty state carries the same
        // action, and "เพิ่มหมวดแรก" contains "เพิ่มหมวด" — two buttons for one
        // job, one of them ambiguous to anything matching by name.
        action={
          categories && categories.length > 0 ? (
            <Button onClick={() => setEditing('new')}>เพิ่มหมวด</Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {/* A failed load must not read as an empty catalogue — an owner acting on
          that would recreate categories that already exist. */}
      {isError && (
        <Alert tone="error" title="โหลดหมวดสินค้าไม่สำเร็จ">
          ลองรีเฟรชอีกครั้ง อย่าเพิ่งสร้างหมวดใหม่ — ของเดิมอาจยังอยู่
        </Alert>
      )}

      {!isLoading && !isError && categories?.length === 0 && (
        <EmptyState
          icon={<FolderTree />}
          title="ยังไม่มีหมวดสินค้า"
          description="สร้างหมวดแรกเพื่อจัดกลุ่มสินค้า ลูกค้าจะกรองตามหมวดได้ในหน้าแคตตาล็อก"
          action={<Button onClick={() => setEditing('new')}>เพิ่มหมวดแรก</Button>}
        />
      )}

      {!isLoading && !isError && categories && categories.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {category.name}
                  {!category.is_active && <Badge>ปิดการแสดง</Badge>}
                </p>
                <p className="font-mono text-xs text-muted-foreground">/{category.slug}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 sm:min-h-9"
                onClick={() => setEditing(category)}
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
