import { X } from 'lucide-react'
import { useToastStore } from '@/lib/toastStore'
import { Button } from '@/components/ui/button'

/**
 * One message at a time, and it does not disappear on a timer.
 *
 * Feedback that vanishes makes people race the clock to check whether they
 * added the right thing, and an auto-dismissing message with a button in it is
 * both a WCAG 2.2.1 timing problem and unreachable for anyone using a screen
 * reader. So: it stays until it is dismissed or replaced, the announcement is a
 * separate text-only live region, and the controls live in ordinary DOM that
 * never steals focus.
 *
 * It also refuses to overlay anything on a phone. Floating it at the bottom
 * covered the sticky buy bar — the very button just pressed — and floating it
 * at the top covered the nav, which a message that never times out would then
 * hide indefinitely. So on mobile it is a banner in the normal flow at the top
 * of the page, and only on wider screens, where there is spare room, does it
 * float.
 */
export function Toaster() {
  const toast = useToastStore((state) => state.toast)
  const announcement = useToastStore((state) => state.announcement)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <>
      {/* Present from first render — a live region created at the moment of the
          message is frequently missed by screen readers. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {toast && (
        <div
          key={toast.id}
          data-slot="toast"
          className="mx-4 mt-4 flex items-start gap-3 rounded-md border border-border bg-card p-3.5 [animation:toast-in_200ms_var(--ease-out-quint)] sm:fixed sm:right-4 sm:bottom-4 sm:z-[var(--z-toast)] sm:mx-0 sm:mt-0 sm:w-88 sm:shadow-lg"
        >
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{toast.title}</p>
            {toast.detail && (
              <p className="mt-0.5 tabular-nums text-muted-foreground">{toast.detail}</p>
            )}
            {toast.action && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2.5 min-h-11 sm:min-h-9"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss()
                }}
              >
                {toast.action.label}
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="ปิดการแจ้งเตือน"
            className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:size-9"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </>
  )
}
