import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  /** Changes on every show so the entrance animation restarts rather than queues. */
  id: number
  title: string
  detail?: string
  action?: ToastAction
}

interface ToastState {
  toast: Toast | null
  /**
   * Text-only copy of the message for the live region. Kept separate from the
   * visible toast on purpose: a live region containing a link or button is
   * announced but cannot be reached in time, so the announcement carries the
   * words and the visible toast carries the controls.
   */
  announcement: string
  show: (toast: Omit<Toast, 'id'>) => void
  dismiss: () => void
}

let nextId = 0

export const useToastStore = create<ToastState>()((set) => ({
  toast: null,
  announcement: '',
  // One at a time, replaced rather than stacked: a buyer adding six items in a
  // row should not build a tower of notices to dismiss.
  show: (toast) =>
    set({
      toast: { ...toast, id: ++nextId },
      announcement: [toast.title, toast.detail].filter(Boolean).join(' '),
    }),
  dismiss: () => set({ toast: null, announcement: '' }),
}))
