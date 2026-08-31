import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/core/auth/useProfile'
import { useUpdateProfile } from '@/core/profile/useUpdateProfile'
import { useAuth } from '@/core/auth/useAuth'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'

export function ProfilePage() {
  const { signOut } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setPhone(profile.phone ?? '')
    }
  }, [profile])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await updateProfile.mutateAsync({ full_name: fullName, phone })
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <PageHeader title="บัญชีของคุณ" description="ข้อมูลติดต่อที่ใช้กับคำสั่งซื้อ" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-md border border-border bg-card p-5">
        {error && <Alert tone="error" title="บันทึกไม่สำเร็จ">{error}</Alert>}
        {saved && !error && <Alert tone="success" title="บันทึกแล้ว" />}
        <Field label="อีเมล" hint="เปลี่ยนอีเมลเองไม่ได้ ติดต่อร้านหากต้องการเปลี่ยน">
          <Input id="email" value={profile?.email ?? ''} disabled />
        </Field>
        <Field label="ชื่อ-นามสกุล">
          <Input
            id="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="เบอร์โทร">
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={updateProfile.isPending} className="self-start">
          {updateProfile.isPending ? 'กำลังบันทึก' : 'บันทึกการเปลี่ยนแปลง'}
        </Button>
      </form>

      <nav className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
        <Link to="/account/addresses" className="px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-accent">
          สมุดที่อยู่
        </Link>
        <Link to="/orders" className="px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-accent">
          ประวัติคำสั่งซื้อ
        </Link>
      </nav>

      <Button variant="outline" onClick={() => signOut()} className="self-start">
        ออกจากระบบ
      </Button>
    </div>
  )
}
