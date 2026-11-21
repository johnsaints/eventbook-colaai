import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { login, persistSession, registerUser, ROLE_LABELS } from '../api'
import AppLayout from '../components/AppLayout'
import type { ReservationDraft } from '../orders'
import { showToast } from '../toast'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const loginContext = state as { reservationDraft?: ReservationDraft; returnToHistory?: boolean } | null
  const reservationDraft = loginContext?.reservationDraft

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return

    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    const controller = new AbortController()
    requestRef.current = controller
    setSubmitting(true)
    setError('')

    try {
      await registerUser(name, email, password, controller.signal)
      if (controller.signal.aborted) return

      const session = await login(email, password, controller.signal)
      if (controller.signal.aborted) return

      if (session) {
        persistSession(session.token, session.user, false)
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
        if (loginContext?.returnToHistory === true) {
          void navigate('/meus-ingressos', { replace: true })
          return
        }
        void navigate('/', { replace: true })
        return
      }

      void navigate('/login', { replace: true, state })
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof TypeError) {
        setError('Não foi possível conectar à API. Verifique sua conexão e tente novamente.')
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível criar a conta. Tente novamente.')
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
            <span className="eyebrow">Conta de comprador</span>
            <h1>Criar conta no ColaAí</h1>
            <p className="event-meta">Cadastre-se para reservar e gerenciar seus ingressos.</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Nome completo
              <input name="name" type="text" minLength={3} autoComplete="name" placeholder="Seu nome" required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                minLength={6}
                autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres"
                required
              />
            </label>
            {error && <p className="form-alert" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>

          <p className="auth-switch">
            Já tem uma conta?{' '}
            <Link to="/login" state={state}>Entrar</Link>
          </p>
        </div>
      </main>
    </AppLayout>
  )
}
