import { useEffect } from 'react'
import { useProductVariants } from '@/modules/optional/variants/useProductVariants'
import type { Database } from '@/lib/database.types'

type Variant = Database['public']['Tables']['product_variants']['Row']

export default function VariantSelector({
  productId,
  selectedVariantId,
  onVariantsLoaded,
  onSelect,
  onError,
}: {
  productId: string
  selectedVariantId: string | null
  onVariantsLoaded: (hasVariants: boolean) => void
  onSelect: (variant: Variant | null) => void
  onError: () => void
}) {
  const { data: variants, isLoading, isError } = useProductVariants(productId)
  const activeVariants = (variants ?? []).filter((v) => v.is_active)
  const hasActiveVariants = activeVariants.length > 0

  useEffect(() => {
    if (variants) {
      onVariantsLoaded(hasActiveVariants)
    } else if (isError) {
      onError()
    }
  }, [variants, isError, hasActiveVariants, onVariantsLoaded, onError])

  if (isLoading) return null
  if (isError) return <p className="text-sm text-destructive">Failed to load options.</p>
  if (!hasActiveVariants) return null

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Options</span>
      <div className="flex flex-wrap gap-2">
        {activeVariants.map((v) => {
          const outOfStock = v.stock_quantity <= 0
          const selected = v.id === selectedVariantId
          return (
            <button
              key={v.id}
              type="button"
              disabled={outOfStock}
              onClick={() => onSelect(v)}
              className={
                'rounded-md border px-3 py-1.5 text-sm ' +
                (selected ? 'border-foreground' : 'border-input') +
                (outOfStock ? ' cursor-not-allowed opacity-50 line-through' : '')
              }
            >
              {v.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
