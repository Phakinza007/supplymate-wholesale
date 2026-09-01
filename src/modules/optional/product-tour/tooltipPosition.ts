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

/**
 * Trim a target to the part of it the visitor can actually see.
 *
 * A step's anchor is whatever element carries the meaning, and that is
 * sometimes a whole section: the home page's category block is one element
 * around six tiles, which on a phone is taller than the screen. Highlighting
 * all of it highlights nothing — the dim ends up a few pixels at the edges and
 * the "spotlight" loses its job. Clamping to the visible slice keeps the
 * highlight meaningful without asking every page to sprout finer anchors.
 *
 * Returns null when nothing of the target is on screen, which the caller reads
 * as "no highlight to draw".
 */
export function clampRectToViewport(
  rect: Rect,
  viewport: { width: number; height: number },
  headerHeight: number,
): Rect | null {
  const top = Math.max(rect.top, headerHeight)
  const bottom = Math.min(rect.top + rect.height, viewport.height)
  if (bottom - top <= 0) return null
  return { top, left: rect.left, width: rect.width, height: bottom - top }
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
