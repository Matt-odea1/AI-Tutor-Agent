/**
 * toastStore — global, multi-toast notification queue.
 *
 * Ported verbatim from the student app. Replaces the instructor app's old
 * `hooks/useToast.ts`, which held exactly ONE toast at a time (a second
 * notification silently clobbered the first) and had to be threaded through
 * every page that wanted to notify. Any component can now call
 * `useToastStore.getState().addToast(...)` — or the hook — and the globally
 * mounted <ToastContainer /> renders every live toast.
 */
import { create } from 'zustand'

const TOAST_DEFAULT_MS = 3000

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (message: string, type: ToastType, duration?: number) => void
  removeToast: (id: string) => void
  clearAllToasts: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message: string, type: ToastType = 'info', duration: number = TOAST_DEFAULT_MS) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const toast: Toast = { id, message, type, duration }

    set((state) => ({
      toasts: [...state.toasts, toast],
    }))

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearAllToasts: () => {
    set({ toasts: [] })
  },
}))
