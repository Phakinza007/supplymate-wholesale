import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Full border plus a tint of the tone's own hue. Never a thick left stripe:
// that reads as decoration and carries no meaning a screen reader can use.
const alertVariants = cva('rounded-md border px-3.5 py-3 text-sm leading-relaxed', {
  variants: {
    tone: {
      info: 'border-[color-mix(in_srgb,var(--brand-secondary)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand-secondary)_6%,var(--card))] text-foreground',
      warning:
        'border-[color-mix(in_srgb,var(--status-pending)_30%,var(--border))] bg-[var(--status-pending-bg)] text-foreground',
      success:
        'border-[color-mix(in_srgb,var(--status-verified)_30%,var(--border))] bg-[var(--status-verified-bg)] text-foreground',
      error:
        'border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] bg-[var(--status-cancelled-bg)] text-foreground',
    },
  },
  defaultVariants: { tone: 'info' },
})

function Alert({
  className,
  tone,
  title,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> &
  VariantProps<typeof alertVariants> & { title?: React.ReactNode }) {
  return (
    <div
      data-slot="alert"
      // Errors interrupt; the rest are read when the user gets to them.
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1 text-muted-foreground')}>{children}</div>}
    </div>
  )
}

export { Alert }
