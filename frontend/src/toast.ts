export type ToastTone = 'success' | 'info' | 'error'

export type ToastItem = {
  id: string
  message: string
  detail?: string
  tone: ToastTone
}

type ShowToastInput = {
  message: string
  detail?: string
  tone?: ToastTone
  durationMs?: number
}

const DEFAULT_DURATION_MS = 4800
const MAX_VISIBLE_TOASTS = 3

let sequence = 0
let currentToasts: ToastItem[] = []
const listeners = new Set<() => void>()
const timers = new Map<string, number>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

/** Remove uma notificação ativa e limpa o temporizador associado. */
export function dismissToast(id: string) {
  const timer = timers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  const next = currentToasts.filter((toast) => toast.id !== id)
  if (next.length !== currentToasts.length) {
    currentToasts = next
    emitChange()
  }
}

/** Exibe uma notificação temporária no canto superior direito da tela. */
export function showToast({
  message,
  detail,
  tone = 'success',
  durationMs = DEFAULT_DURATION_MS,
}: ShowToastInput) {
  const duplicated = currentToasts.find(
    (toast) => toast.message === message && toast.detail === detail && toast.tone === tone,
  )
  if (duplicated) {
    dismissToast(duplicated.id)
  }

  sequence += 1
  const id = `ca-toast-${sequence}`
  const nextToast: ToastItem = { id, message, detail, tone }
  const combined = [...currentToasts, nextToast]
  const overflow = combined.slice(0, Math.max(0, combined.length - MAX_VISIBLE_TOASTS))
  for (const stale of overflow) {
    const staleTimer = timers.get(stale.id)
    if (staleTimer !== undefined) {
      window.clearTimeout(staleTimer)
      timers.delete(stale.id)
    }
  }
  currentToasts = combined.slice(-MAX_VISIBLE_TOASTS)

  if (typeof window !== 'undefined' && durationMs > 0) {
    const timer = window.setTimeout(() => dismissToast(id), durationMs)
    timers.set(id, timer)
  }

  emitChange()
  return id
}

export function getToasts() {
  return currentToasts
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
