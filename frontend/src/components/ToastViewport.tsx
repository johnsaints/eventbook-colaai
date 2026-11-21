import { useSyncExternalStore } from 'react'
import { dismissToast, getToasts, subscribeToasts } from '../toast'
import { CheckCircleIcon, CloseIcon, ShieldCheckIcon } from './Icons'

/** Camada fixa no canto superior direito para notificações breves do ColaAí. */
export default function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)

  if (toasts.length === 0) return null

  return (
    <div className="ca-toast-viewport" aria-label="Notificações">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`ca-toast ca-toast-${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span className="ca-toast-accent" aria-hidden="true" />
          <span className="ca-toast-icon" aria-hidden="true">
            {toast.tone === 'success' ? (
              <CheckCircleIcon width={20} height={20} variant="gradient" />
            ) : (
              <ShieldCheckIcon width={20} height={20} variant="gradient" />
            )}
          </span>
          <div className="ca-toast-content">
            <p className="ca-toast-message">{toast.message}</p>
            {toast.detail && <span className="ca-toast-detail">{toast.detail}</span>}
          </div>
          <button
            type="button"
            className="ca-toast-close"
            aria-label="Fechar notificação"
            onClick={() => dismissToast(toast.id)}
          >
            <CloseIcon width={15} height={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
