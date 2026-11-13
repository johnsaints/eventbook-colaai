import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { canAccessPanel, login, sessionTokenKey, type AuthUser } from '../api'
import AppLayout from '../components/AppLayout'
import type { ReservationDraft } from '../orders'

export default function LoginPage() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const loginContext = state as { reservationDraft?: ReservationDraft; returnToHistory?: boolean } | null
  const reservationDraft = loginContext?.reservationDraft
  const [user, setUser] = useState<AuthUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
      const session = await login(email, password, controller.signal)
      if (controller.signal.aborted) return

      if (!session) {
        setError('E-mail ou senha incorretos.')
        return
      }

      sessionStorage.setItem(sessionTokenKey, session.token)
      if (typeof reservationDraft?.eventId === 'string' && Array.isArray(reservationDraft.items)) {
        void navigate('/events/' + encodeURIComponent(reservationDraft.eventId), {
          replace: true,
          state: { reservationDraft },
        })
        return
      }
      if (loginContext?.returnToHistory === true && session.user.role === 'BUYER') {
        void navigate('/meus-ingressos', { replace: true })
        return
      }
      setUser(session.user)
    } catch (error) {
      if (controller.signal.aborted) return

      if (error instanceof TypeError) {
        setError('Não foi possível conectar à API. Verifique sua conexão e tente novamente.')
      } else {
        setError(error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.')
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  function logout() {
    sessionStorage.removeItem(sessionTokenKey)
    setUser(null)
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

          {user ? (
            <div className="auth-form">
              <p className="form-status" role="status">Sessão iniciada como {user.name}.</p>
              <p className="event-meta">Perfil: <span className="role-badge">{user.role}</span></p>
              <div className="auth-actions">
                {canAccessPanel(user.role) && <Link to="/painel" className="btn btn-primary">Abrir painel</Link>}
                {user.role === 'BUYER' && <Link to="/meus-ingressos" className="btn btn-primary">Meus Ingressos</Link>}
                {user.role === 'STAFF' && <Link to="/check-in" className="btn btn-primary">Abrir check-in</Link>}
                <button type="button" className="btn btn-ghost" onClick={logout}>Sair</button>
              </div>
            </div>
          ) : (
            <>
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  E-mail
                  <input name="email" type="email" autoComplete="username" placeholder="voce@exemplo.com" required />
                </label>
                <label>
                  Senha
                  <input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" required />
                </label>
                {error && <p className="form-alert" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Entrando…' : 'Entrar'}
                </button>
              </form>

              <p className="auth-switch">
                Ainda não tem conta?{' '}
                <Link to="/register" state={state}>Criar conta</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </AppLayout>
  )
}
