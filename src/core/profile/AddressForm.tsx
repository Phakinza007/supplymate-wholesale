import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/database.types'

type Address = Database['public']['Tables']['addresses']['Row']
type AddressInput = Omit<Database['public']['Tables']['addresses']['Insert'], 'user_id'>

export function AddressForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Address
  onSubmit: (input: AddressInput) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<AddressInput>({
    label: initial?.label ?? '',
    recipient_name: initial?.recipient_name ?? '',
    phone: initial?.phone ?? '',
    line1: initial?.line1 ?? '',
    line2: initial?.line2 ?? '',
    subdistrict: initial?.subdistrict ?? '',
    district: initial?.district ?? '',
    province: initial?.province ?? '',
    postal_code: initial?.postal_code ?? '',
    is_default: initial?.is_default ?? false,
  })

  function field(key: keyof AddressInput) {
    return {
      value: (form[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="label">Label</Label>
        <Input id="label" placeholder="Home, Office…" {...field('label')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="recipient_name">Recipient name</Label>
        <Input id="recipient_name" required {...field('recipient_name')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" required {...field('phone')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="line1">Address line 1</Label>
        <Input id="line1" required {...field('line1')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="line2">Address line 2</Label>
        <Input id="line2" {...field('line2')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="subdistrict">Subdistrict</Label>
          <Input id="subdistrict" {...field('subdistrict')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="district">District</Label>
          <Input id="district" {...field('district')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="province">Province</Label>
          <Input id="province" required {...field('province')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="postal_code">Postal code</Label>
          <Input id="postal_code" required {...field('postal_code')} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_default ?? false}
          onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
        />
        Set as default address
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save address'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
