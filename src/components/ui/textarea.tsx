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
    />
  )
}

export { Textarea }
