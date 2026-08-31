import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Tones are the order-status tokens from index.css. The primitive stays
// domain-free: callers map their own vocabulary onto a tone (see
// src/lib/orderStatus.ts), so product status or anything added later reuses
// this without touching it.
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1.5 rounded-sm border border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending)]',
        verified: 'bg-[var(--status-verified-bg)] text-[var(--status-verified)]',
        shipped: 'bg-[var(--status-shipped-bg)] text-[var(--status-shipped)]',
        done: 'bg-[var(--status-done-bg)] text-[var(--status-done)]',
        cancelled: 'bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge }
