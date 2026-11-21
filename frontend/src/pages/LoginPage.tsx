import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  canAccessBuyerTickets,
  defaultRouteForRole,
  login,
  persistSession,
  requestMagicLink,
  ROLE_LABELS,
} from '../api'
import AppLayout from '../components/AppLayout'
import { LockIcon, MailIcon } from '../components/Icons'
import type { ReservationDraft } from '../orders'
import { showToast } from '../toast'

type AuthMode = 'password' | 'magic'

const magicContextStorageKey = 'colaai:magic-login-context'

function parsePreviewPath(previewUrl: string): string | null {
  try {
    const parsed = new URL(previewUrl, window.location.origin)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const loginContext = state as { reservationDraft?: ReservationDraft; returnToHistory?: boolean } | null
  const reservationDraft = loginContext?.reservationDraft

  const [mode, setMode] = useState<AuthMode>('password')
  const [rememberMe, setRememberMe] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [magicStatus, setMagicStatus] = useState('')
  const [magicPreviewPath, setMagicPreviewPath] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setMagicStatus('')
    setMagicPreviewPath(null)
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const controller = new AbortController()
    requestRef.current = controller
    setSubmitting(true)
    setError('')

    try {
      const session = await login(email, password, controller.signal, rememberMe)
      if (controller.signal.aborted) return

      if (!session) {
        setError('E-mail ou senha incorretos.')
        return
      }

      persistSession(session.token, session.user, rememberMe)
      showToast({
        message: `Sessão iniciada como ${session.user.name}.`,
        detail: ROLE_LABELS[session.user.role],
        tone: 'success',
      })

      if (typeof reservationDraft?.eventId === 'string' && Array.isArray(reservationDraft.items)) {
        void navigate('/events/' + encodeURIComponent(reservationDraft.eventId), {
          replace: true,
          state: { reservationDraft },
        })
        return
      }
      if (loginContext?.returnToHistory === true && canAccessBuyerTickets(session.user.role)) {
        void navigate('/meus-ingressos', { replace: true })
        return
      }
      void navigate(defaultRouteForRole(session.user.role), { replace: true })
    } catch (err) {
      if (controller.signal.aborted) return

      if (err instanceof TypeError) {
        setError('Não foi possível conectar à API. Verifique sua conexão e tente novamente.')
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível entrar. Tente novamente.')
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  async function handleMagicSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return

    const form = new FormData(event.currentTarget)
    const email = String(form.get('magicEmail') ?? '').trim()
    const controller = new AbortController()
    requestRef.current = controller
    setSubmitting(true)
    setError('')
    setMagicStatus('')
    setMagicPreviewPath(null)

    try {
      sessionStorage.removeItem(magicContextStorageKey)
      if (loginContext || rememberMe) {
        localStorage.setItem(
          magicContextStorageKey,
          JSON.stringify({ ...(loginContext ?? {}), rememberMe }),
        )
      } else {
        localStorage.removeItem(magicContextStorageKey)
      }
    } catch {
      // Ignora falhas de acesso em armazenamento restrito
    }

    try {
      const response = await requestMagicLink(email, controller.signal)
      if (controller.signal.aborted) return

      setMagicStatus(response.message)
      if (response.previewUrl) {
        setMagicPreviewPath(parsePreviewPath(response.previewUrl))
      }
    } catch (err) {
      if (controller.signal.aborted) return

      if (err instanceof TypeError) {
        setError('Não foi possível conectar à API. Verifique sua conexão e tente novamente.')
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível solicitar o link mágico.')
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <main className="catalog auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <span className="eyebrow">Acesso</span>
            <h1>Entrar no ColaAí</h1>
            <p className="event-meta">Entre com sua conta de comprador, organizador ou staff.</p>
          </header>

          <div className="auth-mode-tabs" role="tablist" aria-label="Método de autenticação">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'password'}
              className={mode === 'password' ? 'auth-mode-tab active' : 'auth-mode-tab'}
              onClick={() => switchMode('password')}
            >
              <LockIcon width={15} height={15} variant={mode === 'password' ? 'gradient' : 'current'} />
              <span>Com senha</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'magic'}
              className={mode === 'magic' ? 'auth-mode-tab active' : 'auth-mode-tab'}
              onClick={() => switchMode('magic')}
            >
              <MailIcon width={15} height={15} variant={mode === 'magic' ? 'gradient' : 'current'} />
              <span>Link mágico</span>
            </button>
          </div>

          {mode === 'password' ? (
            <form className="auth-form" onSubmit={handlePasswordSubmit}>
              <label>
                E-mail
                <input name="email" type="email" autoComplete="username" placeholder="voce@exemplo.com" required />
              </label>
              <label>
                Senha
                <input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" required />
              </label>
              <label className="remember-access-field">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span className="remember-access-copy">
                  <strong>Lembrar acesso neste dispositivo</strong>
                  <span>Mantém sua conta conectada por até 30 dias em dispositivos seguros.</span>
                </span>
              </label>
              {error && <p className="form-alert" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleMagicSubmit}>
              <label>
                E-mail cadastrado
                <input name="magicEmail" type="email" autoComplete="email" placeholder="voce@exemplo.com" required />
              </label>
              <p className="event-meta">
                Enviaremos um link de uso único válido por 15 minutos para entrar sem digitar senha.
              </p>
              <label className="remember-access-field">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span className="remember-access-copy">
                  <strong>Lembrar acesso neste dispositivo</strong>
                  <span>Mantém sua conta conectada por até 30 dias em dispositivos seguros.</span>
                </span>
              </label>
              {error && <p className="form-alert" role="alert">{error}</p>}
              {magicStatus && <p className="form-status" role="status">{magicStatus}</p>}
              {magicPreviewPath && (
                <div className="magic-preview-box">
                  <span className="eyebrow">Prévia em desenvolvimento/teste</span>
                  <p className="event-meta">Nenhum SMTP configurado neste ambiente local.</p>
                  <Link to={magicPreviewPath} className="btn btn-secondary btn-sm">
                    <MailIcon width={14} height={14} />
                    Abrir link mágico de acesso
                  </Link>
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Enviando link…' : 'Enviar link mágico'}
              </button>
            </form>
          )}

          <p className="auth-switch">
            Ainda não tem conta?{' '}
            <Link to="/register" state={state}>Criar conta</Link>
          </p>
        </div>
      </main>
    </AppLayout>
  )
}
