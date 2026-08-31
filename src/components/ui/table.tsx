import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A real <table>, in its own horizontal scroll container so a wide admin table
 * never makes the page scroll sideways. Hairline row rules, no zebra: in the
 * Ledger palette the rule already separates rows, and a tinted stripe would
 * fight the status chips sitting in them.
 */
/**
 * `stickyHeader` is opt-in because a sticky <thead> only works inside a
 * container that scrolls vertically. Without a height cap the wrapper never
 * scrolls, the header pins to a box that never moves, and the sticky does
 * nothing at all — silently.
 */
function Table({
  className,
  stickyHeader,
  ...props
}: React.ComponentProps<'table'> & { stickyHeader?: boolean }) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-md border border-border bg-card',
        stickyHeader && 'max-h-[min(70vh,40rem)] overflow-y-auto',
      )}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('sticky top-0 z-[var(--z-dropdown)] bg-muted', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border last:border-b-0 transition-colors hover:bg-accent data-[state=selected]:bg-accent',
        className,
      )}
      {...props}
    />
  )
}

/** `numeric` right-aligns and locks digit widths so a column compares down. */
function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        'border-b border-border px-3 py-2.5 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-3 py-2.5 align-middle',
        numeric && 'text-right tabular-nums whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('px-3 py-2 text-left text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption }
