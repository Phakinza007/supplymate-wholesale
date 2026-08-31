import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors outline-none',
        'placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        // `aria-invalid:` is not a built-in Tailwind variant — the arbitrary form is
        // what actually generates a rule. Verified in the browser, not assumed.
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-0',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
