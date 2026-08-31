import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthShell } from '@/core/auth/AuthShell'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่" description="ตั้งรหัสผ่านใหม่เพื่อเข้าใช้งานบัญชีต่อ">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="error" title="บันทึกรหัสผ่านไม่สำเร็จ">{error}</Alert>}
        <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 6 ตัวอักษร">
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
          {submitting ? 'กำลังบันทึก' : 'บันทึกรหัสผ่านใหม่'}
        </Button>
      </form>
    </AuthShell>
  )
}
