import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/getErrorMessage'
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
        setError(result?.reason ?? 'Invalid promo code.')
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
      setError(getErrorMessage(err, 'Failed to check promo code.'))
    } finally {
      setChecking(false)
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>
          Code <span className="font-medium">{applied.code}</span> applied
        </span>
        <Button size="sm" variant="outline" onClick={onRemove}>
          Remove
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="Promo code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1"
        />
        <Button type="button" variant="outline" disabled={!code || checking} onClick={handleApply}>
          {checking ? 'Checking…' : 'Apply'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
