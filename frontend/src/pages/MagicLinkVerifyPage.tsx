import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  canAccessPanel,
  notifyUserUpdated,
  sessionTokenKey,
  verifyMagicLink,
  type LoginSession,
} from '../api'
import AppLayout from '../components/AppLayout'
import { MailIcon } from '../components/Icons'
import type { ReservationDraft } from '../orders'

const magicContextStorageKey = 'colaai:magic-login-context'
const inFlightVerifications = new Map<string, Promise<LoginSession>>()

type MagicRedirectContext = {
  reservationDraft?: ReservationDraft
  returnToHistory?: boolean
}

function redeemMagicTokenOnce(token: string): Promise<LoginSession> {
  const existing = inFlightVerifications.get(token)
  if (existing) return existing

  const promise = verifyMagicLink(token)
  inFlightVerifications.set(token, promise)
  return promise
}

function consumeStoredMagicContext(): MagicRedirectContext | null {
  try {
    const raw = sessionStorage.getItem(magicContextStorageKey)
    if (!raw) return null
    sessionStorage.removeItem(magicContextStorageKey)
    return JSON.parse(raw) as MagicRedirectContext
  } catch {
    sessionStorage.removeItem(magicContextStorageKey)
    return null
  }
}

export default function MagicLinkVerifyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawToken = searchParams.get('token')?.trim() ?? ''

  const [result, setResult] = useState<{ token: string; session?: LoginSession; error?: string } | null>(null)
  const verifying = Boolean(rawToken) && result?.token !== rawToken
  const error = !rawToken
    ? 'Token do link mágico ausente na URL.'
    : result?.token === rawToken
      ? result.error ?? ''
      : ''
  const session = result?.token === rawToken ? result.session ?? null : null

  useEffect(() => {
    if (!rawToken) return

    let cancelled = false

    redeemMagicTokenOnce(rawToken)
      .then((verified) => {
        if (cancelled) return

        sessionStorage.setItem(sessionTokenKey, verified.token)
        notifyUserUpdated(verified.user)

        const context = consumeStoredMagicContext()
        const draft = context?.reservationDraft
        if (typeof draft?.eventId === 'string' && Array.isArray(draft.items)) {
          void navigate('/events/' + encodeURIComponent(draft.eventId), {
            replace: true,
            state: { reservationDraft: draft },
          })
          return
        }
        if (context?.returnToHistory === true && verified.user.role === 'BUYER') {
          void navigate('/meus-ingressos', { replace: true })
          return
        }

        setResult({ token: rawToken, session: verified })
      })
      .catch((err) => {
        if (cancelled) return
        setResult({
          token: rawToken,
          error: err instanceof Error ? err.message : 'Link mágico inválido ou expirado.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [navigate, rawToken])

  return (
    <AppLayout>
      <main className="catalog auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <span className="eyebrow">Acesso sem senha</span>
            <h1>Link Mágico</h1>
          </header>

          {verifying ? (
            <div className="auth-form" role="status">
              <p className="form-status">Validando seu link de acesso…</p>
            </div>
          ) : error ? (
            <div className="auth-form">
              <p className="form-alert" role="alert">{error}</p>
              <div className="auth-actions">
                <Link to="/login" className="btn btn-primary">
                  <MailIcon width={15} height={15} />
                  Solicitar novo link
                </Link>
              </div>
            </div>
          ) : session && (
            <div className="auth-form">
              <p className="form-status" role="status">Sessão iniciada como {session.user.name}.</p>
              <p className="event-meta">E-mail autenticado: {session.user.email}</p>
              <div className="auth-actions">
                <Link to="/perfil" className="btn btn-primary">Meu Perfil</Link>
                {session.user.role === 'BUYER' && (
                  <Link to="/meus-ingressos" className="btn btn-secondary">Meus Ingressos</Link>
                )}
                {canAccessPanel(session.user.role) && (
                  <Link to="/painel" className="btn btn-secondary">Abrir painel</Link>
                )}
                {session.user.role === 'STAFF' && (
                  <Link to="/check-in" className="btn btn-secondary">Abrir check-in</Link>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  )
}
