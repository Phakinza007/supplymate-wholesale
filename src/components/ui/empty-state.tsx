import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title: React.ReactNode
  /** Say what this list will hold and how the first one gets there. */
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/**
 * An empty list should teach the interface, not announce "no data". The dashed
 * edge says the container is real and currently unfilled, which is different
 * from a failed load — that case is an Alert, deliberately not this.
 */
function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-start gap-3 rounded-md border border-dashed border-input bg-card px-6 py-10',
        className,
      )}
    >
      {icon && <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <div>
        <p className="font-semibold">{title}</p>
        {description && (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export { EmptyState }
