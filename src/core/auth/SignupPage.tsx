import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/core/auth/AuthShell'
import { brandConfig } from '@/config/branding.config'

export function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    // signUp() reports "already registered" as a success with an empty
    // identities array, not as an error — see CLAUDE.md.
    if (data.user && data.user.identities?.length === 0) {
      setError('อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบหรือกู้คืนรหัสผ่าน')
      return
    }
    if (!data.session) {
      setSent(true)
      return
    }
    navigate('/', { replace: true })
  }

  if (sent) {
    return (
      <AuthShell
        title="ตรวจอีเมลของคุณ"
        description={`ส่งลิงก์ยืนยันไปที่ ${email} แล้ว กดลิงก์ในอีเมลเพื่อเปิดใช้งานบัญชี`}
        footer={
          <Link to="/login" className="font-semibold text-signal underline-offset-4 hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          ถ้าไม่พบอีเมลภายในไม่กี่นาที ลองดูในโฟลเดอร์อีเมลขยะ
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="สมัครสมาชิก"
      description={`เปิดบัญชีสำหรับสั่งซื้อกับ ${brandConfig.storeName}`}
      footer={
        <span>
          มีบัญชีอยู่แล้ว?{' '}
          <Link to="/login" className="font-semibold text-signal underline-offset-4 hover:underline">
            เข้าสู่ระบบ
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="error" title="สมัครสมาชิกไม่สำเร็จ">{error}</Alert>}
        <Field label="ชื่อ-นามสกุล">
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="อีเมล">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="รหัสผ่าน" hint="อย่างน้อย 6 ตัวอักษร">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={submitting}>
          {submitting ? 'กำลังสมัคร' : 'สมัครสมาชิก'}
        </Button>
      </form>
    </AuthShell>
  )
}
