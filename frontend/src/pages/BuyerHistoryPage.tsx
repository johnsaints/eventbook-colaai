import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import ribbonSymbol from '../assets/colaai-simbolo-matriz.png'
import logoWordmark from '../assets/ColaAi_wordmark_aprovado_transparente.webp'
import ticketCrowdBg from '../assets/colaai-ticket-crowd.webp'
import {
  canAccessCheckin,
  canAccessPanel,
  getStoredSessionUser,
  notifyUserUpdated,
  ROLE_LABELS,
  sessionTokenKey,
  userUpdatedEventName,
  type AuthUser,
} from '../api'
import AppLayout from '../components/AppLayout'
import CancelOrderAction from '../components/CancelOrderAction'
import Drawer from '../components/Drawer'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  PinIcon,
  QrCodeIcon,
  TicketIcon,
} from '../components/Icons'
import TicketQrCode from '../components/TicketQrCode'
import { formatDate } from '../events'
import { cancelMyOrder, listMyOrders, listMyTickets, type CancelOrderResult, type HistoryAccess, type HistoryOrder, type HistoryPage, type HistoryResult, type HistoryTicket } from '../history'
import { formatPrice, priceInCents } from '../orders'
import './BuyerHistoryPage.css'

const formatTicketDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const formatTicketTime = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

const ticketStatuses: Record<HistoryTicket['status'], string> = {
  VALID: 'Válido',
  USED: 'Utilizado',
  CANCELLED: 'Cancelado',
}

const ticketStatusClass: Record<HistoryTicket['status'], string> = {
  VALID: 'ca-ticket-status ca-ticket-status-valid',
  USED: 'ca-ticket-status ca-ticket-status-used',
  CANCELLED: 'ca-ticket-status ca-ticket-status-cancelled',
}

const orderStatuses: Record<HistoryOrder['status'], string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
}

function dateLabel(iso: string) {
  return <time dateTime={iso}>{formatDate.format(new Date(iso))}</time>
}

function TicketStageArtwork() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const beamBlurId = `ca-beam-${uid}`
  const beamCyanId = `ca-cyan-${uid}`
  const beamPinkId = `ca-pink-${uid}`
  const lampCyanId = `ca-lamp-c-${uid}`
  const lampPinkId = `ca-lamp-p-${uid}`

  return (
    <svg className="colaai-ticket-stage-svg" viewBox="0 0 380 280" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
      <defs>
        <filter id={beamBlurId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <linearGradient id={beamCyanId} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#9cfbff" stopOpacity="0.88" />
          <stop offset="40%" stopColor="#00c8ff" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#0b46ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={beamPinkId} x1="100%" y1="0%" x2="10%" y2="100%">
          <stop offset="0%" stopColor="#ffa8f8" stopOpacity="0.86" />
          <stop offset="42%" stopColor="#eb2cff" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#6b1eff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={lampCyanId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="30%" stopColor="#6af4ff" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#008cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={lampPinkId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="30%" stopColor="#ff85f9" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#b41eff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#${beamBlurId})`}>
        <polygon points="312,16 196,178 282,194" fill={`url(#${beamCyanId})`} />
        <polygon points="326,11 245,188 315,198" fill={`url(#${beamCyanId})`} opacity="0.8" />
        <polygon points="348,22 280,192 346,200" fill={`url(#${beamCyanId})`} opacity="0.65" />
        <polygon points="368,14 294,190 374,198" fill={`url(#${beamPinkId})`} />
      </g>
      <circle cx="312" cy="18" r="15" fill={`url(#${lampCyanId})`} />
      <circle cx="326" cy="12" r="9" fill={`url(#${lampCyanId})`} />
      <circle cx="348" cy="24" r="9" fill={`url(#${lampCyanId})`} />
      <circle cx="368" cy="15" r="18" fill={`url(#${lampPinkId})`} />
    </svg>
  )
}

function renderTicket(ticket: HistoryTicket, onExpand: (ticket: HistoryTicket) => void) {
  const startsAt = new Date(ticket.event.startsAt)

  return (
    <div className="colaai-ticket">
      <div className="colaai-ticket-brand">
        <TicketStageArtwork />
        <img src={ticketCrowdBg} alt="" className="colaai-ticket-crowd" />
        <div className="colaai-ticket-brand-lockup" aria-hidden="true">
          <img src={ribbonSymbol} alt="" className="colaai-ticket-symbol" />
          <img src={logoWordmark} alt="ColaAí" className="colaai-ticket-wordmark" />
          <span className="colaai-ticket-label">INGRESSO</span>
        </div>
      </div>

      <div className="colaai-ticket-panel-wrap">
        <div className="colaai-ticket-overlay">
          <div className="colaai-ticket-main">
            <div className="colaai-ticket-head">
              <div className="colaai-ticket-status-row">
                <span className={ticketStatusClass[ticket.status]}>
                  <span className="ca-ticket-status-bar" aria-hidden="true" />
                  <strong>{ticketStatuses[ticket.status]}</strong>
                </span>
              </div>
              <h3>{ticket.event.title}</h3>
            </div>

            <ul className="colaai-ticket-details">
              <li>
                <CalendarIcon width={14} height={14} className="ticket-detail-icon" />
                <time dateTime={ticket.event.startsAt}>{formatTicketDate.format(startsAt)}</time>
              </li>
              <li>
                <ClockIcon width={14} height={14} className="ticket-detail-icon" />
                <span>{formatTicketTime.format(startsAt)}</span>
              </li>
              <li>
                <PinIcon width={14} height={14} className="ticket-detail-icon" />
                <span>{ticket.event.location}</span>
              </li>
              <li className="ticket-detail-lot">
                <TicketIcon width={14} height={14} variant="gradient" className="ticket-detail-icon" />
                <span>{ticket.lot.name}</span>
              </li>
            </ul>
          </div>

          <div className="colaai-ticket-stub">
            <TicketQrCode value={ticket.code} className="colaai-ticket-qr" />
            <code className="colaai-ticket-code">{ticket.code}</code>
            <button
              type="button"
              className="colaai-ticket-expand-btn"
              onClick={() => onExpand(ticket)}
              aria-label={`Apresentar QR de ${ticket.event.title}`}
            >
              <QrCodeIcon width={13} height={13} />
              <span>Apresentar QR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderOrder(order: HistoryOrder, action: ReactNode) {
  return (
    <div className="order-card-body">
      <div className="order-card-head">
        <h3>{order.event.title}</h3>
        <span className="status-pill status-neutral">
          <strong>{orderStatuses[order.status]}</strong>
        </span>
      </div>
      <div className="card-meta-list">
        <p className="event-meta meta-row">
          <PinIcon variant="gradient" className="meta-icon" />
          <span>{order.event.location}</span>
        </p>
        <p className="event-meta meta-row">
          <CalendarIcon variant="gradient" className="meta-icon" />
          <span>{dateLabel(order.event.startsAt)}</span>
        </p>
      </div>
      <p className="order-amount">Valor do pedido <strong>{formatPrice(priceInCents(order.totalAmount))}</strong></p>
      <p className="event-meta">Pedido em {dateLabel(order.createdAt)}</p>
      {order.status === 'PENDING' && <p className="event-meta">Reserva até {dateLabel(order.expiresAt)}</p>}
      <p className="event-meta">Número do pedido <code className="history-code">{order.id}</code></p>
      {action}
    </div>
  )
}

type HistorySectionProps<T> = {
  id: string
  title: string
  paginationLabel: string
  emptyMessage: string
  token: string
  revision: number
  notice?: string
  load: (page: number, token: string, signal: AbortSignal) => Promise<HistoryResult<T>>
  onAccess: (kind: HistoryAccess) => void
  renderItem: (item: T) => ReactNode
}

function HistorySection<T extends { id: string }>({
  id, title, paginationLabel, emptyMessage, token, revision, notice, load, onAccess, renderItem,
}: HistorySectionProps<T>) {
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ page: number; attempt: number; revision: number; data: HistoryPage<T> | null } | null>(null)
  const current = result?.page === page && result.attempt === attempt && result.revision === revision ? result : null
  const totalPages = result?.data?.meta.totalPages ?? 0

  useEffect(() => {
    const controller = new AbortController()

    async function loadPage() {
      try {
        const response = await load(page, token, controller.signal)
        if (controller.signal.aborted) return
        if (response.kind === 'ready') {
          setResult({ page, attempt, revision, data: response.page })
        } else {
          onAccess(response.kind)
        }
      } catch {
        if (!controller.signal.aborted) setResult({ page, attempt, revision, data: null })
      }
    }

    void loadPage()
    return () => controller.abort()
  }, [attempt, load, onAccess, page, revision, token])

  const canGoBack = current !== null && page > 1
  const canGoForward = current?.data != null && page < totalPages

  return (
    <section className="history-section ca-section-heading" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {notice && <p role="status">{notice}</p>}
      {!current && <p role="status">Carregando…</p>}
      {current?.data === null && (
        <>
          <p role="alert">Não foi possível carregar esta lista.</p>
          <button className="history-action" type="button" onClick={() => setAttempt(attempt + 1)}>Tentar novamente</button>
        </>
      )}
      {current?.data && (
        current.data.data.length === 0 ? (
          <p>{page === 1 ? emptyMessage : 'Nenhum resultado nesta página.'}</p>
        ) : (
          <ul className={id === 'my-tickets-title' ? 'ticket-list-stack' : 'event-list'}>
            {current.data.data.map(item => (
              <li key={item.id}>
                <article className={id === 'my-tickets-title' ? 'event-card colaai-ticket-card' : 'event-card'}>
                  {renderItem(item)}
                </article>
              </li>
            ))}
          </ul>
        )
      )}
      {(totalPages > 1 || page > 1) && (
        <nav className="history-nav" aria-label={paginationLabel}>
          <button
            className="history-action"
            type="button"
            aria-disabled={!canGoBack}
            onClick={() => { if (canGoBack) setPage(page - 1) }}
          >
            <ArrowLeftIcon width={15} height={15} />
            Anterior
          </button>
          <span className="pagination-info" aria-live="polite">Página {page}{page <= totalPages ? ' de ' + totalPages : ''}</span>
          <button
            className="history-action"
            type="button"
            aria-disabled={!canGoForward}
            onClick={() => { if (canGoForward) setPage(page + 1) }}
          >
            Próxima
            <ArrowRightIcon width={15} height={15} />
          </button>
        </nav>
      )}
    </section>
  )
}

export default function BuyerHistoryPage() {
  const [token] = useState(() => sessionStorage.getItem(sessionTokenKey))
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(() => getStoredSessionUser())
  const [access, setAccess] = useState<HistoryAccess | null>(null)
  const [now, setNow] = useState(Date.now)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<HistoryTicket | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  async function copyTicketCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(true)
    } catch {
      setCopiedCode(false)
    }
  }

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    function handleUserUpdated(event: Event) {
      setSessionUser((event as CustomEvent<AuthUser | null>).detail)
    }

    window.addEventListener(userUpdatedEventName, handleUserUpdated)
    return () => window.removeEventListener(userUpdatedEventName, handleUserUpdated)
  }, [])

  useEffect(() => {
    if (!token || access) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [access, token])

  const handleAccess = useCallback((kind: HistoryAccess) => {
    if (kind === 'login' && sessionStorage.getItem(sessionTokenKey) === token) {
      sessionStorage.removeItem(sessionTokenKey)
      notifyUserUpdated(null)
    }
    setAccess(current => current === 'login' ? current : kind)
  }, [token])

  async function cancelOrder(id: string): Promise<CancelOrderResult | undefined> {
    if (!token || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setCancellingId(id)
    setNotice('')

    try {
      const result = await cancelMyOrder(id, token, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'cancelled') {
        setNotice('Pedido cancelado com sucesso.')
        setRevision(current => current + 1)
      } else if (result.kind === 'login' || result.kind === 'forbidden') {
        handleAccess(result.kind)
      }
      return result
    } catch {
      if (!controller.signal.aborted) {
        return { kind: 'retry', message: 'Não foi possível conectar à API. Tente novamente.' }
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setCancellingId(null)
    }
  }

  return (
    <AppLayout>
      <main className="catalog">
        <header className="page-header">
          <span className="eyebrow">Área do comprador</span>
          <h1>Meus Ingressos</h1>
        </header>
      {token && !access ? (
        <>
          <HistorySection
            id="my-tickets-title"
            title="Ingressos"
            paginationLabel="Paginação de ingressos"
            emptyMessage="Você ainda não tem ingressos."
            token={token}
            revision={revision}
            load={listMyTickets}
            onAccess={handleAccess}
            renderItem={(ticket) => renderTicket(ticket, (selected) => {
              setCopiedCode(false)
              setSelectedTicket(selected)
            })}
          />
          <HistorySection
            id="my-orders-title"
            title="Histórico de pedidos"
            paginationLabel="Paginação de pedidos"
            emptyMessage="Você ainda não tem pedidos."
            token={token}
            revision={revision}
            load={listMyOrders}
            onAccess={handleAccess}
            notice={notice}
            renderItem={order => renderOrder(order, (
              <CancelOrderAction order={order} now={now} cancellingId={cancellingId} onCancel={cancelOrder} />
            ))}
          />
        </>
      ) : access === 'forbidden' ? (
        <div className="event-card">
          <p className="form-alert" role="alert">
            A área Meus Ingressos é exclusiva para contas de Comprador (e Administrador em modo de teste).
          </p>
          {sessionUser && (
            <p className="event-meta">
              Seu perfil atual é <span className="role-badge">{ROLE_LABELS[sessionUser.role]}</span>.
            </p>
          )}
          <div className="auth-actions">
            <Link to="/login" state={{ returnToHistory: true }} className="btn btn-primary btn-sm">Entrar como comprador</Link>
            {canAccessPanel(sessionUser?.role) && (
              <Link to="/painel" className="btn btn-secondary btn-sm">Abrir painel</Link>
            )}
            {canAccessCheckin(sessionUser?.role) && (
              <Link to="/check-in" className="btn btn-secondary btn-sm">Abrir check-in</Link>
            )}
          </div>
        </div>
      ) : (
        <div className="event-card">
          <p role={access ? 'alert' : undefined}>
            {access === 'login'
              ? 'Sua sessão expirou. Entre novamente para ver seus ingressos e pedidos.'
              : 'Entre com uma conta de comprador para ver seus ingressos e pedidos.'}
          </p>
          <p><Link to="/login" state={{ returnToHistory: true }}>Entrar como comprador</Link></p>
        </div>
      )}
      </main>

      <Drawer
        open={Boolean(selectedTicket)}
        onClose={() => setSelectedTicket(null)}
        side="right"
        size="md"
        eyebrow="Ingresso Digital"
        title={selectedTicket?.event.title ?? ''}
        subtitle={selectedTicket?.lot.name}
      >
        {selectedTicket && (
          <div className="ticket-drawer-content">
            <div className="ticket-drawer-status">
              <span className={ticketStatusClass[selectedTicket.status]}>
                <span className="ca-ticket-status-bar" aria-hidden="true" />
                <strong>{ticketStatuses[selectedTicket.status]}</strong>
              </span>
            </div>

            <div className="ticket-drawer-qr-box">
              <TicketQrCode value={selectedTicket.code} className="ticket-drawer-qr" />
            </div>

            <div className="ticket-drawer-code-row">
              <code className="history-code">{selectedTicket.code}</code>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void copyTicketCode(selectedTicket.code)}
              >
                {copiedCode ? <CheckIcon width={15} height={15} /> : <CopyIcon width={15} height={15} />}
                {copiedCode ? 'Código copiado' : 'Copiar código'}
              </button>
            </div>

            <dl className="ticket-drawer-meta">
              <div>
                <dt>Data e horário</dt>
                <dd>{dateLabel(selectedTicket.event.startsAt)}</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>{selectedTicket.event.location}</dd>
              </div>
              <div>
                <dt>Pedido</dt>
                <dd><code className="history-code">{selectedTicket.orderId}</code></dd>
              </div>
            </dl>
          </div>
        )}
      </Drawer>
    </AppLayout>
  )
}
