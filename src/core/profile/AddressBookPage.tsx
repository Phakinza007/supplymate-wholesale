import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAddresses } from '@/core/profile/useAddresses'
import { useAddressMutations } from '@/core/profile/useAddressMutations'
import { AddressForm } from '@/core/profile/AddressForm'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Address = Database['public']['Tables']['addresses']['Row']

export function AddressBookPage() {
  const { data: addresses, isLoading, isError } = useAddresses()
  const { createAddress, updateAddress, deleteAddress } = useAddressMutations()
  const [editing, setEditing] = useState<Address | 'new' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>

  if (isError) {
    return (
      <p className="p-8 text-sm text-destructive">
        Failed to load addresses. Please try again later.
      </p>
    )
  }

  if (editing) {
    const initial = editing === 'new' ? undefined : editing
    return (
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'Add address' : 'Edit address'}
        </h1>
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
              setFormError(getErrorMessage(err, 'Failed to save address.'))
            }
          }}
        />
        {formError && <p className="mt-4 text-sm text-destructive">{formError}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Address book</h1>
        <Button size="sm" onClick={() => setEditing('new')}>
          Add address
        </Button>
      </div>
      {addresses?.length === 0 && (
        <p className="text-sm text-muted-foreground">No addresses yet.</p>
      )}
      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
      <ul className="flex flex-col gap-3">
        {addresses?.map((address) => (
          <li key={address.id} className="rounded-md border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">
                  {address.label || 'Address'}
                  {address.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.recipient_name} · {address.phone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.province}{' '}
                  {address.postal_code}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(address)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setDeleteError(null)
                    deleteAddress.mutate(address.id, {
                      onError: (err) => {
                        setDeleteError(getErrorMessage(err, 'Failed to delete address.'))
                      },
                    })
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Link to="/account" className="text-sm hover:underline">
        Back to profile
      </Link>
    </div>
  )
}
