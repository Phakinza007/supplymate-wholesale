import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Loading placeholder shaped like the content it replaces. Product UI loads
 * into a task: a spinner in the middle of the page tells the user nothing about
 * what is coming, a shaped block does.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
