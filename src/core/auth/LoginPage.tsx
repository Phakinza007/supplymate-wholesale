import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/core/auth/AuthShell'
import { brandConfig } from '@/config/branding.config'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <AuthShell
      title="เข้าสู่ระบบ"
      description={`สั่งซื้อและติดตามคำสั่งซื้อกับ ${brandConfig.storeName}`}
      footer={
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
          <Link to="/signup" className="font-semibold text-signal underline-offset-4 hover:underline">
            สมัครสมาชิกใหม่
          </Link>
          <Link
            to="/forgot-password"
            className="font-semibold text-signal underline-offset-4 hover:underline"
          >
            ลืมรหัสผ่าน
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="error" title="เข้าสู่ระบบไม่สำเร็จ">{error}</Alert>}
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
        <Field label="รหัสผ่าน">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={submitting}>
          {submitting ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
        </Button>
      </form>
    </AuthShell>
  )
}
