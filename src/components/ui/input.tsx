import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm transition-colors outline-none',
        'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-semibold',
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
        // Numbers in this app are compared down a column, not read as prose.
        '[&[type=number]]:tabular-nums',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
