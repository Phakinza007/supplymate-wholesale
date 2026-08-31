import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
      <Field label="ชื่อเรียกที่อยู่" hint="เช่น หน้าร้าน, ครัวกลาง">
        <Input id="label" placeholder="หน้าร้าน" {...field('label')} />
      </Field>
      <Field label="ชื่อผู้รับ" required>
        <Input id="recipient_name" autoComplete="name" required {...field('recipient_name')} />
      </Field>
      <Field label="เบอร์โทร" required>
        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" required {...field('phone')} />
      </Field>
      <Field label="ที่อยู่ บรรทัดที่ 1" required>
        <Input id="line1" required {...field('line1')} />
      </Field>
      <Field label="ที่อยู่ บรรทัดที่ 2">
        <Input id="line2" {...field('line2')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="แขวง / ตำบล">
          <Input id="subdistrict" {...field('subdistrict')} />
        </Field>
        <Field label="เขต / อำเภอ">
          <Input id="district" {...field('district')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="จังหวัด" required>
          <Input id="province" required {...field('province')} />
        </Field>
        <Field label="รหัสไปรษณีย์" required>
          <Input
            id="postal_code"
            inputMode="numeric"
            autoComplete="postal-code"
            required
            {...field('postal_code')}
          />
        </Field>
      </div>
      <Checkbox
        checked={form.is_default ?? false}
        onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
      >
        ตั้งเป็นที่อยู่หลัก
      </Checkbox>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={submitting}>
          {submitting ? 'กำลังบันทึก' : 'บันทึกที่อยู่'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </form>
  )
}
