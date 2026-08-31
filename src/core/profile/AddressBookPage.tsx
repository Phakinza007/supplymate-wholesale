import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useAddresses } from '@/core/profile/useAddresses'
import { useAddressMutations } from '@/core/profile/useAddressMutations'
import { AddressForm } from '@/core/profile/AddressForm'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import type { Database } from '@/lib/database.types'

type Address = Database['public']['Tables']['addresses']['Row']

export function AddressBookPage() {
  const { data: addresses, isLoading, isError } = useAddresses()
  const { createAddress, updateAddress, deleteAddress } = useAddressMutations()
  const [editing, setEditing] = useState<Address | 'new' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
        <PageHeader title={editing === 'new' ? 'เพิ่มที่อยู่' : 'แก้ไขที่อยู่'} />
        {formError && <Alert tone="error" title="บันทึกที่อยู่ไม่สำเร็จ">{formError}</Alert>}
        <AddressForm
          initial={initial}
          submitting={createAddress.isPending || updateAddress.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={async (input) => {
            setFormError(null)
            try {
              if (editing === 'new') {
                await createAddress.mutateAsync(input)
              } else {
                await updateAddress.mutateAsync({ id: editing.id, ...input })
              }
              setEditing(null)
            } catch (err) {
              setFormError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <PageHeader
        title="สมุดที่อยู่"
        description="ที่อยู่จัดส่งที่เลือกได้ตอนสั่งซื้อ"
        // Hidden while the list is empty: the empty state carries the same
        // action, and two primary buttons for one job is one too many.
        action={
          addresses && addresses.length > 0 ? (
            <Button onClick={() => setEditing('new')}>เพิ่มที่อยู่</Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {isError && (
        <Alert tone="error" title="โหลดที่อยู่ไม่สำเร็จ">
          ลองรีเฟรชอีกครั้ง อย่าเพิ่งเพิ่มที่อยู่ซ้ำ — รายการเดิมอาจยังอยู่
        </Alert>
      )}

      {deleteError && <Alert tone="error" title="ลบที่อยู่ไม่สำเร็จ">{deleteError}</Alert>}

      {!isLoading && !isError && addresses?.length === 0 && (
        <EmptyState
          icon={<MapPin />}
          title="ยังไม่มีที่อยู่จัดส่ง"
          description="เพิ่มที่อยู่ไว้ก่อน จะได้ไม่ต้องพิมพ์ใหม่ทุกครั้งตอนสั่งซื้อ"
          action={<Button onClick={() => setEditing('new')}>เพิ่มที่อยู่</Button>}
        />
      )}

      {!isLoading && !isError && addresses && addresses.length > 0 && (
        <ul className="flex flex-col gap-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-border bg-card p-4"
            >
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {address.label || 'ที่อยู่จัดส่ง'}
                  {address.is_default && <Badge>ที่อยู่หลัก</Badge>}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {address.recipient_name} · <span className="font-mono">{address.phone}</span>
                </p>
                <p className="mt-0.5 leading-relaxed text-muted-foreground">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.province}{' '}
                  <span className="font-mono">{address.postal_code}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setEditing(address)}>
                  แก้ไข
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 text-destructive hover:bg-[var(--status-cancelled-bg)] sm:min-h-9"
                  onClick={() => {
                    setDeleteError(null)
                    deleteAddress.mutate(address.id, {
                      onError: (err) => {
                        setDeleteError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
                      },
                    })
                  }}
                >
                  ลบ
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/account"
        className="text-sm font-semibold text-signal underline-offset-4 hover:underline"
      >
        กลับไปหน้าบัญชี
      </Link>
    </div>
  )
}
