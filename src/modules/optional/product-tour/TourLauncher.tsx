import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * The restart control. It belongs in the site header, but SiteHeader is core
 * and core may not import an optional module — so core renders an inert empty
 * slot and this fills it.
 */
export function TourLauncher({ onStart }: { onStart: () => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  // Looked up in an effect, not at render: this module loads lazily and may
  // resolve before or after SiteHeader has mounted its slot.
  useEffect(() => {
    setSlot(document.getElementById('tour-launcher-slot'))
  }, [])

  if (!slot) return null
  return createPortal(
    <button
      type="button"
      onClick={onStart}
      className="min-h-11 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
    >
      ดูวิธีสั่งซื้อ
    </button>,
    slot,
  )
}
