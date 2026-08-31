import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { TourLauncher } from './TourLauncher'
import { TourOverlay } from './TourOverlay'
import { planSteps } from './stepSequence'
import { tourSteps, type TourStep } from './tourSteps'
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

function anchorNode(step: TourStep): HTMLElement | null {
  // The tier step wants a product that genuinely has a ladder. If the catalogue
  // has none, this resolves to nothing and the step skips itself — and so does
  // the ladder step that follows it. No special case needed.
  if (step.id === 'catalogue-tiers') {
    return document.querySelector<HTMLElement>('[data-tour-tiers]')
  }
  return document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
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

    void waitFor(() => anchorNode(step)).then((node) => {
      if (cancelled) return
      if (!node) {
        if (index + 1 < plan.length) setIndex(index + 1)
        else stop()
        return
      }
      nodeRef.current = node
      node.scrollIntoView({ block: 'center', behavior: 'auto' })
      cartOnEntry.current = cartCount
      setRect(toRect(node))
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

  // The waiting step advances when the cart actually grows — observed, never
  // intercepted. The tour does not press controls that change data.
  const waitingForAction = step?.advance === 'action'
  useEffect(() => {
    if (waitingForAction && cartCount > cartOnEntry.current) advance()
  }, [waitingForAction, cartCount, advance])

  return (
    <>
      <TourLauncher onStart={start} />
      {plan && step && (
        <TourOverlay
          title={step.title}
          body={step.body}
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
