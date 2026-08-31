import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface AppliedPromo {
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  discountAmount: number
}

export default function PromoCodeField({
  subtotal,
  applied,
  onApply,
  onRemove,
}: {
  subtotal: number
  applied: AppliedPromo | null
  onApply: (promo: AppliedPromo) => void
  onRemove: () => void
}) {
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApply() {
    setError(null)
    setChecking(true)
    try {
      const { data, error } = await supabase.rpc('validate_promo_code', {
        p_code: code,
        p_subtotal: subtotal,
      })
      if (error) throw error
      const result = data?.[0]
      if (!result || !result.valid) {
        // `reason` comes back from validate_promo_code and is already the
        // specific explanation; only the fallback is ours to word.
        setError(result?.reason ?? 'ใช้โค้ดนี้ไม่ได้')
        return
      }
      onApply({
        code: code.toUpperCase(),
        discountType: result.discount_type as 'percent' | 'fixed',
        discountValue: result.discount_value ?? 0,
        discountAmount: result.discount_amount ?? 0,
      })
      setCode('')
    } catch (err) {
      setError(getErrorMessage(err, 'ตรวจสอบโค้ดไม่สำเร็จ ลองใหม่อีกครั้ง'))
    } finally {
      setChecking(false)
    }
  }

  if (applied) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          ใช้โค้ด <Badge tone="verified">{applied.code}</Badge> แล้ว
        </span>
        <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onRemove}>
          นำออก
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          aria-label="โค้ดส่วนลด"
          placeholder="โค้ดส่วนลด"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1"
        />
        <Button type="button" variant="outline" disabled={!code} loading={checking} onClick={handleApply}>
          {checking ? 'กำลังตรวจสอบ' : 'ใช้โค้ด'}
        </Button>
      </div>
      {error && <Alert tone="error" title="ใช้โค้ดไม่ได้">{error}</Alert>}
    </div>
  )
}
