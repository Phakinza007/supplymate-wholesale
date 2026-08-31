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
          // `aria-invalid:` is not a built-in Tailwind variant — the arbitrary form is
        // what actually generates a rule. Verified in the browser, not assumed.
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-0',
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
