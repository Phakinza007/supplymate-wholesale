import { useState, type FormEvent } from 'react'
import { useAdminPromotions } from '@/modules/optional/promotions/useAdminPromotions'
import { useAdminPromotionMutations } from '@/modules/optional/promotions/useAdminPromotionMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/database.types'

type Promotion = Database['public']['Tables']['promotions']['Row']

interface PromotionFormInput {
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  min_subtotal: number | null
  max_uses: number | null
  expires_at: string | null
  is_active: boolean
}

function emptyForm(initial?: Promotion): PromotionFormInput {
  return {
    code: initial?.code ?? '',
    discount_type: (initial?.discount_type as 'percent' | 'fixed' | undefined) ?? 'percent',
    discount_value: initial?.discount_value ?? 10,
    min_subtotal: initial?.min_subtotal ?? null,
    max_uses: initial?.max_uses ?? null,
    expires_at: initial?.expires_at ? initial.expires_at.slice(0, 10) : null,
    is_active: initial?.is_active ?? true,
  }
}

export default function PromotionsAdminPage() {
  const { data: promotions, isLoading, isError } = useAdminPromotions()
  const { createPromotion, updatePromotion } = useAdminPromotionMutations()
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const [form, setForm] = useState<PromotionFormInput>(emptyForm())
  const [error, setError] = useState<string | null>(null)

  function startEdit(promotion: Promotion | 'new') {
    setError(null)
    setForm(emptyForm(promotion === 'new' ? undefined : promotion))
    setEditing(promotion)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      ...form,
      expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null,
    }
    try {
      if (editing === 'new') {
        await createPromotion.mutateAsync(payload)
      } else if (editing) {
        await updatePromotion.mutateAsync({ id: editing.id, ...payload })
      }
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save promotion.'))
    }
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError) return <p className="p-8 text-destructive">Failed to load promotions.</p>

  if (editing) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-8">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'New promotion' : 'Edit promotion'}
        </h1>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-type">Type</Label>
              <select
                id="promo-type"
                value={form.discount_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))
                }
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="percent">Percent off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-value">
                {form.discount_type === 'percent' ? 'Percent off' : 'Amount off (THB)'}
              </Label>
              <Input
                id="promo-value"
                type="number"
                min={0}
                max={form.discount_type === 'percent' ? 100 : undefined}
                step={form.discount_type === 'percent' ? 1 : 0.01}
                required
                value={form.discount_value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-min-subtotal">Minimum subtotal (THB, optional)</Label>
              <Input
                id="promo-min-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={form.min_subtotal ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    min_subtotal: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-max-uses">Max uses (optional)</Label>
              <Input
                id="promo-max-uses"
                type="number"
                min={1}
                value={form.max_uses ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_uses: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="promo-expires">Expires at end of this day (optional)</Label>
            <Input
              id="promo-expires"
              type="date"
              value={form.expires_at ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value || null }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={createPromotion.isPending || updatePromotion.isPending}>
              {createPromotion.isPending || updatePromotion.isPending
                ? 'Saving…'
                : 'Save promotion'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Promotions</h1>
        <Button size="sm" onClick={() => startEdit('new')}>
          New promotion
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {promotions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No promotions yet.</p>
        )}
        {promotions?.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {p.code}
                {!p.is_active && (
                  <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {p.discount_type === 'percent'
                  ? `${p.discount_value}% off`
                  : `${formatPrice(p.discount_value)} off`}
                {' · '}Used {p.uses_count}
                {p.max_uses ? `/${p.max_uses}` : ''} times
                {p.expires_at && ` · Expires ${new Date(p.expires_at).toLocaleDateString()}`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
