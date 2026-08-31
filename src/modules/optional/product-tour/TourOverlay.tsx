import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { progressLabel } from './stepSequence'
import { tooltipPosition, type Position, type Rect } from './tooltipPosition'

const GAP = 12

/**
 * The dim is four bands around the target rather than one sheet with a
 * `box-shadow` spread, because the hole has to be a real hole: on the
 * add-to-cart step the visitor must be able to press the button underneath.
 * A full-viewport backdrop would swallow that click, and the one step the tour
 * is built around would be impossible to complete.
 */
function Backdrop({ rect, onDismiss }: { rect: Rect | null; onDismiss: () => void }) {
  const band = 'pointer-events-auto absolute bg-black/55'
  if (!rect) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-auto absolute inset-0 bg-black/55"
        onClick={onDismiss}
      />
    )
  }
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  return (
    <div aria-hidden="true" onClick={onDismiss}>
      <div className={band} style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
      <div className={band} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div
        className={band}
        style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }}
      />
      <div className={band} style={{ top: rect.top, left: right, right: 0, height: rect.height }} />
      <div
        className="pointer-events-none absolute rounded-md ring-2 ring-primary"
        style={{
          top: rect.top - 3,
          left: rect.left - 3,
          width: rect.width + 6,
          height: rect.height + 6,
        }}
      />
    </div>
  )
}

export function TourOverlay({
  title,
  body,
  targetRect,
  index,
  total,
  waitingForAction,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: {
  title: string
  body: string
  targetRect: Rect | null
  index: number
  total: number
  waitingForAction: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onClose: () => void
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  useLayoutEffect(() => {
    const node = tooltipRef.current
    if (!node) return
    const header = document.querySelector('header')
    setPosition(
      tooltipPosition({
        target: targetRect ?? { top: 0, left: 0, width: window.innerWidth, height: 0 },
        tooltip: { width: node.offsetWidth, height: node.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        headerHeight: header?.getBoundingClientRect().height ?? 0,
        gap: GAP,
      }),
    )
  }, [targetRect, title, body])

  // Focus follows the step, so a keyboard or screen-reader user is taken to the
  // new text rather than left behind on the previous step's button. Not on the
  // waiting step: focus there belongs to the control the visitor must press.
  useEffect(() => {
    if (!waitingForAction) tooltipRef.current?.focus()
  }, [index, waitingForAction])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      // The waiting step is deliberately NOT modal: trapping Tab would put the
      // add-to-cart button out of a keyboard user's reach, which is the one
      // thing that step exists to have them do.
      if (event.key !== 'Tab' || waitingForAction) return
      const focusables = tooltipRef.current?.querySelectorAll<HTMLElement>('button')
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, waitingForAction])

  return (
    <div className="pointer-events-none fixed inset-0 z-[var(--z-tour)]" data-tour-overlay>
      <Backdrop rect={targetRect} onDismiss={onClose} />

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal={waitingForAction ? undefined : true}
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="pointer-events-auto absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-border bg-card p-4 shadow-lg outline-none max-sm:w-full max-sm:rounded-b-none motion-reduce:transition-none"
        style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
      >
        <p aria-live="polite" className="text-xs font-semibold text-muted-foreground">
          {progressLabel(index, total)}
        </p>
        <h2 id="tour-title" className="mt-1 font-semibold">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {index > 0 && (
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onPrev}>
              ย้อนกลับ
            </Button>
          )}
          {waitingForAction ? (
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onSkip}>
              ข้าม
            </Button>
          ) : (
            <Button className="min-h-11 sm:min-h-9" onClick={onNext}>
              {index === total - 1 ? 'จบทัวร์' : 'ถัดไป'}
            </Button>
          )}
          <Button variant="ghost" className="ml-auto min-h-11 sm:min-h-9" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  )
}
