import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Primary action for the page, right-aligned from the small breakpoint up. */
  action?: ReactNode
  className?: string
}

/**
 * One heading treatment for every customer page. Hand-typed headings are what
 * drifted the four auth screens apart, and the product type scale is fixed rem
 * (see index.css) precisely so a heading does not resize per page.
 */
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end',
        className,
      )}
    >
      <div>
        <h1 className="text-[length:var(--text-app-title)] font-bold tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
