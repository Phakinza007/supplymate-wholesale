import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The native checkbox, sized to the 44px touch row and tinted with the brand
 * accent. `accent-color` is the one property that restyles a real checkbox
 * without giving up its keyboard behaviour, indeterminate state, or the way
 * assistive tech already understands it.
 */
function Checkbox({ className, children, ...props }: React.ComponentProps<'input'>) {
  return (
    <label className="flex min-h-11 items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          'size-4.5 shrink-0 accent-[var(--brand-secondary)] disabled:opacity-50',
          className,
        )}
        {...props}
      />
      {children}
    </label>
  )
}

export { Checkbox }
