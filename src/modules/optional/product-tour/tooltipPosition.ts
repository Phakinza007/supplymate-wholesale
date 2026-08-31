/**
 * Where the tour's tooltip goes, given where its target ended up.
 *
 * Pure on purpose: placement maths is the part of a hand-rolled tour that
 * actually breaks (tooltips half off-screen, tooltips under the sticky
 * header), and it needs no DOM to check. The caller measures; this decides.
 */

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'sheet'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface PositionInput {
  target: Rect
  tooltip: { width: number; height: number }
  viewport: { width: number; height: number }
  /** The sticky SiteHeader's height. Nothing may be placed underneath it. */
  headerHeight: number
  gap: number
}

export interface Position {
  placement: Placement
  top: number
  left: number
}

/** Below this width there is no room to sit beside a highlighted element. */
const SHEET_BREAKPOINT = 640

function clamp(value: number, min: number, max: number): number {
  // `max < min` when the tooltip is taller than the space available. The lower
  // bound wins, because the header is the thing that must never be covered.
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

export function tooltipPosition({
  target,
  tooltip,
  viewport,
  headerHeight,
  gap,
}: PositionInput): Position {
  if (viewport.width < SHEET_BREAKPOINT) {
    return { placement: 'sheet', top: viewport.height - tooltip.height, left: 0 }
  }

  const minTop = headerHeight + gap
  const maxTop = viewport.height - tooltip.height - gap
  const below = target.top + target.height + gap
  const above = target.top - gap - tooltip.height

  const placement: Placement = below + tooltip.height <= viewport.height - gap ? 'bottom' : 'top'
  const rawTop = placement === 'bottom' ? below : above

  // Centred on the target, then pulled back inside the viewport.
  const rawLeft = target.left + target.width / 2 - tooltip.width / 2

  return {
    placement,
    top: clamp(rawTop, minTop, maxTop),
    left: clamp(rawLeft, gap, viewport.width - tooltip.width - gap),
  }
}
