import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/core/auth/AuthShell'
import { getPasswordResetRedirect, isGitHubPagesBuild } from '@/lib/githubPagesAuth'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordResetRedirect(window.location.origin, isGitHubPagesBuild),
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthShell
        title="ตรวจอีเมลของคุณ"
        // Deliberately non-committal about whether the account exists — saying
        // so would let anyone test which emails are registered.
        description={`ถ้ามีบัญชีที่ใช้ ${email} อยู่ ลิงก์ตั้งรหัสผ่านใหม่กำลังถูกส่งไป`}
        footer={
          <Link to="/login" className="font-semibold text-signal underline-offset-4 hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          ลิงก์มีอายุจำกัด ถ้าหมดอายุแล้วขอใหม่ได้จากหน้านี้
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="ตั้งรหัสผ่านใหม่"
      description="กรอกอีเมลที่ใช้สมัคร แล้วเราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้"
      footer={
        <Link to="/login" className="font-semibold text-signal underline-offset-4 hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="error" title="ส่งลิงก์ไม่สำเร็จ">{error}</Alert>}
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
        <Button type="submit" loading={submitting}>
          {submitting ? 'กำลังส่ง' : 'ส่งลิงก์ตั้งรหัสผ่าน'}
        </Button>
      </form>
    </AuthShell>
  )
}
