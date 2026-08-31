import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

// Ledger: no shadows anywhere. Weight comes from an ink fill or a hairline
// border, the way a stamped form does. The focus ring is declared once in
// index.css, so no variant repeats it.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        outline: 'border border-input bg-card hover:bg-accent active:bg-muted',
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:bg-muted active:bg-secondary',
        ghost: 'hover:bg-accent active:bg-muted',
        link: 'text-signal underline-offset-4 hover:underline',
      },
      size: {
        // 44px is the floor for anything a buyer taps on a phone. Dense admin
        // toolbars opt into `sm` deliberately; they are mouse-first surfaces.
        default: 'h-11 px-4',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  const Comp = asChild ? Slot : 'button'

  // `asChild` renders someone else's element (usually a Link), which has no
  // busy state to express — pass it through untouched.
  if (asChild) {
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Comp>
    )
  }

  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
