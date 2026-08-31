import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

interface FieldProps {
  label: React.ReactNode
  /** Guidance shown before the user has done anything wrong. */
  hint?: React.ReactNode
  /** Set to show the error state; also wires aria-invalid on the control. */
  error?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactElement<Record<string, unknown>>
}

/**
 * Label, control, hint and error as one unit, with the aria wiring done once.
 * Seventeen pages in src/core hand-rolled this and each one wired a different
 * subset — the accessible name and the error association are exactly the parts
 * that get dropped when it is retyped per page.
 */
function Field({ label, hint, error, required, className, children }: FieldProps) {
  const generatedId = React.useId()
  const childId = (children.props.id as string | undefined) ?? generatedId
  const hintId = hint ? `${childId}-hint` : undefined
  const errorId = error ? `${childId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = React.cloneElement(children, {
    id: childId,
    required: (children.props.required as boolean | undefined) ?? required,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  })

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={childId}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-muted-foreground">
            *
          </span>
        )}
      </Label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs leading-relaxed font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { Field }
