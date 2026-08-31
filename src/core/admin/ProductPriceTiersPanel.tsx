import { useState, type FormEvent } from 'react'
import {
  useProductPriceTiers,
  useProductPriceTierMutations,
} from '@/core/admin/useProductPriceTiers'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_TIERS = 10

export function ProductPriceTiersPanel({ productId }: { productId: string }) {
  const { data: tiers, isLoading, isError } = useProductPriceTiers(productId)
  const { addTier, deleteTier } = useProductPriceTierMutations(productId)
  const [minQuantity, setMinQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addTier.mutateAsync({
        min_quantity: Number(minQuantity),
        unit_price: Number(unitPrice),
      })
      setMinQuantity('')
      setUnitPrice('')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add price tier.'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">ราคาขายส่งตามจำนวน</h2>
      <p className="text-xs text-muted-foreground">
        จำนวนขั้นต่ำของแต่ละขั้นต้องมากกว่า "ขั้นต่ำต่อรายการ" ของสินค้า และมีได้สูงสุด {MAX_TIERS} ขั้น
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load price tiers.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {tiers && tiers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tiers.map((tier) => (
            <li
              key={tier.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <span>
                ตั้งแต่ {tier.min_quantity} ขึ้นไป · {formatPrice(Number(tier.unit_price))}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={deleteTier.isPending}
                onClick={() =>
                  deleteTier.mutate(tier.id, {
                    onError: (err) => setError(getErrorMessage(err, 'Failed to delete price tier.')),
                  })
                }
              >
                ลบ
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tier_min_quantity">ตั้งแต่จำนวน</Label>
          <Input
            id="tier_min_quantity"
            type="number"
            min={1}
            required
            className="w-28"
            value={minQuantity}
            onChange={(e) => setMinQuantity(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tier_unit_price">ราคาต่อหน่วย</Label>
          <Input
            id="tier_unit_price"
            type="number"
            min={0}
            step="0.01"
            required
            className="w-32"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={addTier.isPending || (tiers?.length ?? 0) >= MAX_TIERS}
        >
          เพิ่มขั้นราคา
        </Button>
      </form>
    </div>
  )
}
