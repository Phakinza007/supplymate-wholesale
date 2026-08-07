import { useState, type FormEvent } from 'react'
import { useProductVariants } from '@/modules/optional/variants/useProductVariants'
import { useVariantMutations } from '@/modules/optional/variants/useVariantMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPrice } from '@/lib/formatPrice'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

interface VariantFormInput {
  name: string
  sku: string | null
  price_override: number | null
  stock_quantity: number
  is_active: boolean
}

function emptyForm(initial?: Variant): VariantFormInput {
  return {
    name: initial?.name ?? '',
    sku: initial?.sku ?? null,
    price_override: initial?.price_override ?? null,
    stock_quantity: initial?.stock_quantity ?? 0,
    is_active: initial?.is_active ?? true,
  }
}

export default function VariantsPanel({ productId }: { productId: string }) {
  const { data: variants, isLoading, isError } = useProductVariants(productId)
  const { createVariant, updateVariant } = useVariantMutations(productId)
  const [editing, setEditing] = useState<Variant | 'new' | null>(null)
  const [form, setForm] = useState<VariantFormInput>(emptyForm())
  const [error, setError] = useState<string | null>(null)

  function startEdit(variant: Variant | 'new') {
    setError(null)
    setForm(emptyForm(variant === 'new' ? undefined : variant))
    setEditing(variant)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing === 'new') {
        await createVariant.mutateAsync(form)
      } else if (editing) {
        await updateVariant.mutateAsync({ id: editing.id, ...form })
      }
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save variant.'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Variants</h2>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => startEdit('new')}>
            Add variant
          </Button>
        )}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load variants.</p>}

      {!editing && variants?.length === 0 && (
        <p className="text-sm text-muted-foreground">No variants yet.</p>
      )}

      {!editing && (
        <ul className="flex flex-col gap-2">
          {variants?.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {v.name}
                  {!v.is_active && (
                    <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {v.price_override != null ? formatPrice(v.price_override) : 'Base price'} ·
                  Stock: {v.stock_quantity}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => startEdit(v)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant-name">Name</Label>
            <Input
              id="variant-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Black / M"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-sku">SKU</Label>
              <Input
                id="variant-sku"
                value={form.sku ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value || null }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-price">Price override (THB)</Label>
              <Input
                id="variant-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price_override ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    price_override: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="variant-stock">Stock quantity</Label>
            <Input
              id="variant-stock"
              type="number"
              min={0}
              value={form.stock_quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) || 0 }))
              }
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={createVariant.isPending || updateVariant.isPending}>
              {createVariant.isPending || updateVariant.isPending ? 'Saving…' : 'Save variant'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
