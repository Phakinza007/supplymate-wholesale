import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { TourLauncher } from './TourLauncher'
import { TourOverlay } from './TourOverlay'
import { planSteps } from './stepSequence'
import { stepBody, tourSteps, type TourStep } from './tourSteps'
import type { Rect } from './tooltipPosition'
import { waitFor } from './waitFor'

const SEEN_KEY = 'supplymate-tour-seen-v1'

/** localStorage throws in some privacy modes; a tour is never worth a crash. */
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
function recalls(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return true // an unreadable store counts as "already seen": never nag.
  }
}

/**
 * Resolve a step's target, and say whether it is the ideal one.
 *
 * The tier step wants a product that genuinely has a ladder, but it must fall
 * back to any product card: reaching the product page at all depends on this
 * step having a link to follow, so skipping it in a catalogue with no tiers
 * would strand the tour on /shop and drop the four steps after it too. The
 * ladder step that follows then skips on its own, because a product without
 * tiers renders no ladder.
 */
function anchorNode(
  step: TourStep,
): { node: HTMLElement; ideal: boolean; reason?: string } | null {
  if (step.id === 'catalogue-tiers') {
    const tiered = document.querySelector<HTMLElement>('[data-tour-tiers]')
    if (tiered) return { node: tiered, ideal: true }
    const any = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
    return any ? { node: any, ideal: false } : null
  }
  // The cart summary only exists once something is in the cart, and the tour
  // itself offers a "ข้าม" that arrives here with an empty one. The empty state
  // carries the anchor so the closing step lands on something readable instead
  // of a black screen that ends the tour before it can be read.
  if (step.id === 'cart-summary') {
    const filled = document.querySelector<HTMLElement>('[data-tour-cart-total]')
    if (filled) return { node: filled, ideal: true }
    const empty = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
    return empty ? { node: empty, ideal: false } : null
  }
  const node = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
  if (!node) return null
  // An action step's target is only ideal if it can actually be operated, and
  // the page says why it cannot.
  return {
    node,
    ideal: !(node as HTMLButtonElement).disabled,
    reason: node.dataset.tourBlocked,
  }
}

function toRect(node: HTMLElement): Rect {
  const { top, left, width, height } = node.getBoundingClientRect()
  return { top, left, width, height }
}

export default function ProductTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const cartCount = useCartTotalItems()

  const [plan, setPlan] = useState<TourStep[] | null>(null)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [targetIdeal, setTargetIdeal] = useState(true)
  const [blockedReason, setBlockedReason] = useState<string | undefined>(undefined)
  const nodeRef = useRef<HTMLElement | null>(null)
  const cartOnEntry = useRef(0)

  const step = plan?.[index] ?? null

  const stop = useCallback(() => {
    remember(SEEN_KEY, '1')
    setPlan(null)
    setRect(null)
    nodeRef.current = null
  }, [])

  const start = useCallback(() => {
    // Frozen at start: a session arriving mid-tour must not renumber the steps
    // under the visitor.
    setPlan(planSteps(tourSteps, { hasSession: Boolean(session) }))
    setIndex(0)
  }, [session])

  // Auto-start once, and only for someone who came in the front door.
  // Mount-only by design: navigating to "/" later is not a first visit.
  useEffect(() => {
    if (!recalls(SEEN_KEY) && location.pathname === '/') start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Enter a step: navigate if it names a route, wait for its anchor, and move
  // on if the anchor never arrives. Skipping beats hanging on a slow query.
  useEffect(() => {
    if (!plan || !step) return
    let cancelled = false
    setRect(null)
    nodeRef.current = null

    if (step.route && step.route !== location.pathname) navigate(step.route)

    void waitFor(() => anchorNode(step)).then((found) => {
      if (cancelled) return
      if (!found) {
        // Skipping beats waiting -- but the last step has nowhere to skip to,
        // and closing on the spot means the visitor never reads the sentence
        // the tour ends on. Show it with no highlight and let them close it.
        if (index + 1 < plan.length) setIndex(index + 1)
        else setTargetIdeal(false)
        return
      }
      nodeRef.current = found.node
      found.node.scrollIntoView({ block: 'center', behavior: 'auto' })
      cartOnEntry.current = cartCount
      setTargetIdeal(found.ideal)
      setBlockedReason(found.reason)
      // Measure on the next frame: getBoundingClientRect in the same tick as
      // scrollIntoView returns the pre-scroll position, which puts the hole --
      // and therefore the clickable gap -- somewhere the target is not.
      requestAnimationFrame(() => {
        if (!cancelled && nodeRef.current) setRect(toRect(nodeRef.current))
      })
    })

    return () => {
      cancelled = true
    }
    // `cartCount` is read here, not depended on: re-running this on every cart
    // change would restart the very step asking the visitor to change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, index, step])

  // Keep the spotlight on the target while the page moves under it.
  useEffect(() => {
    if (!plan) return
    const remeasure = () => {
      if (nodeRef.current) setRect(toRect(nodeRef.current))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [plan])

  const advance = useCallback(() => {
    if (!plan || !step) return
    // Leaving the catalogue step means opening the product it highlighted. The
    // tour follows that link; it never fabricates a slug.
    if (step.id === 'catalogue-tiers') {
      const href = nodeRef.current?.getAttribute('href')
      if (href) navigate(href)
    }
    if (index + 1 < plan.length) setIndex(index + 1)
    else stop()
  }, [plan, step, index, navigate, stop])

  // A step only waits if the thing it is waiting for can actually happen. A
  // product that needs a variant choice, or is out of stock, renders a disabled
  // button — telling the visitor to press it would strand them with nothing but
  // "ข้าม". Such a step falls back to being read and moved past.
  const waitingForAction = step?.advance === 'action' && targetIdeal
  useEffect(() => {
    if (step?.advance === 'action' && cartCount > cartOnEntry.current) advance()
  }, [step, cartCount, advance])

  return (
    <>
      <TourLauncher onStart={start} />
      {plan && step && (
        <TourOverlay
          title={step.title}
          body={stepBody(step, targetIdeal, blockedReason)}
          targetRect={rect}
          index={index}
          total={plan.length}
          waitingForAction={waitingForAction}
          onNext={advance}
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onSkip={advance}
          onClose={stop}
        />
      )}
    </>
  )
}
