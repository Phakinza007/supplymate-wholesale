import { PRODUCT_STATUSES, type ProductStatus } from '@/lib/productStatus'
import { cn } from '@/lib/utils'

// Short labels, because this sits in a table cell on every row. The long-form
// names live in the legend under the table.
const SHORT_LABEL: Record<ProductStatus, string> = {
  draft: 'ร่าง',
  active: 'แสดง',
  archived: 'เก็บ',
}

const SELECTED_CLASS: Record<ProductStatus, string> = {
  draft: 'bg-[var(--status-pending)] text-white',
  active: 'bg-[var(--status-verified)] text-white',
  archived: 'bg-[var(--status-done)] text-white',
}

// A segmented control rather than a dropdown: the three states are the whole
// vocabulary, and an admin scanning the list should see which one a row is in
// without opening anything.
export function ProductStatusControl({
  value,
  onChange,
  disabled = false,
  productName,
}: {
  value: string
  onChange: (next: ProductStatus) => void
  disabled?: boolean
  productName: string
}) {
  return (
    <div
      role="group"
      aria-label={`สถานะของ ${productName}`}
      className="flex w-fit overflow-hidden rounded-md border border-border text-xs font-semibold"
    >
      {PRODUCT_STATUSES.map((status) => {
        const selected = value === status
        return (
          <button
            key={status}
            type="button"
            aria-pressed={selected}
            disabled={disabled || selected}
            onClick={() => onChange(status)}
            className={cn(
              'px-3 py-2 transition-colors',
              selected
                ? SELECTED_CLASS[status]
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              disabled && !selected && 'pointer-events-none opacity-50',
            )}
          >
            {SHORT_LABEL[status]}
          </button>
        )
      })}
    </div>
  )
}
