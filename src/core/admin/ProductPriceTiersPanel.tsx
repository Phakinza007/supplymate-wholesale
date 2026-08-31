import { useState, type FormEvent } from 'react'
import {
  useProductPriceTiers,
  useProductPriceTierMutations,
} from '@/core/admin/useProductPriceTiers'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

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
      setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">ราคาขายส่งตามจำนวน</h2>
      <p className="text-xs text-muted-foreground">
        จำนวนขั้นต่ำของแต่ละขั้นต้องมากกว่า "ขั้นต่ำต่อรายการ" ของสินค้า และมีได้สูงสุด {MAX_TIERS} ขั้น
      </p>
      {isLoading && <Skeleton className="h-20 w-full" />}
      {/* Distinct from "no tiers yet": an owner who reads a failed load as an
          empty ladder would re-enter tiers that already exist. */}
      {isError && (
        <Alert tone="error" title="โหลดขั้นราคาไม่สำเร็จ">
          ลองรีเฟรชก่อน อย่าเพิ่งกรอกใหม่ — ขั้นเดิมอาจยังอยู่
        </Alert>
      )}
      {error && <Alert tone="error" title="จัดการขั้นราคาไม่สำเร็จ">{error}</Alert>}
      {!isLoading && !isError && tiers?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีขั้นราคา — ลูกค้าจะจ่ายราคาปกติทุกจำนวน
        </p>
      )}

      {tiers && tiers.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
          {tiers.map((tier) => (
            <li key={tier.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="tabular-nums">
                ตั้งแต่ {tier.min_quantity.toLocaleString('th-TH')} ขึ้นไป ·{' '}
                <strong className="font-semibold">{formatPrice(Number(tier.unit_price))}</strong>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 text-destructive hover:bg-[var(--status-cancelled-bg)] sm:min-h-9"
                aria-label={`ลบขั้นราคาตั้งแต่ ${tier.min_quantity}`}
                loading={deleteTier.isPending}
                onClick={() =>
                  deleteTier.mutate(tier.id, {
                    onError: (err) => setError(getErrorMessage(err, 'ลองใหม่อีกครั้ง')),
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
        <Field label="ตั้งแต่จำนวน" required>
          <Input
            id="tier_min_quantity"
            type="number"
            min={1}
            required
            className="w-28"
            value={minQuantity}
            onChange={(e) => setMinQuantity(e.target.value)}
          />
        </Field>
        <Field label="ราคาต่อหน่วย" required>
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
        </Field>
        <Button
          type="submit"
          loading={addTier.isPending}
          disabled={(tiers?.length ?? 0) >= MAX_TIERS}
        >
          เพิ่มขั้นราคา
        </Button>
      </form>
    </div>
  )
}
