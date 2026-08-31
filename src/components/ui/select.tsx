import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The platform's own select. A custom listbox would be a "non-standard form
 * control" — the exact affordance product UI should not reinvent — and the
 * native one already gives Thai buyers the wheel picker on iOS and correct
 * keyboard behaviour everywhere.
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          'flex h-11 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-sm transition-colors outline-none',
          'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
          // Two rules, both arbitrary on purpose: `aria-invalid:` is not a
        // built-in Tailwind variant, and both must live in the utilities layer
        // to outrank `border-input` above — a base-layer rule loses to it
        // whatever its specificity.
        //
        // `:user-invalid` is the browser's own "the user has interacted with
        // this and left it wrong" state, which is the on-blur timing the
        // research prefers over validating every keystroke.
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-0',
        '[&:user-invalid]:border-destructive',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }
