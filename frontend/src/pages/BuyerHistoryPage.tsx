import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import ribbonSymbol from '../assets/colaai-simbolo-matriz.png'
import logoWordmark from '../assets/ColaAi_wordmark_aprovado_transparente.webp'
import { sessionTokenKey } from '../api'
import AppLayout from '../components/AppLayout'
import CancelOrderAction from '../components/CancelOrderAction'
import { ArrowLeftIcon, CalendarIcon, ClockIcon, PinIcon, TicketIcon } from '../components/Icons'
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
  VALID: 'ticket-badge ticket-badge-valid',
  USED: 'ticket-badge ticket-badge-used',
  CANCELLED: 'ticket-badge ticket-badge-cancelled',
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

function renderTicket(ticket: HistoryTicket) {
  const startsAt = new Date(ticket.event.startsAt)

  return (
    <div className="colaai-ticket">
      <div className="colaai-ticket-brand">
        <svg
          className="colaai-ticket-crowd"
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 90V66c7-1 10-12 13-22l4 20c5-1 11 4 14 10 4-9 7-22 10-33l5 22c4-5 11-2 15 4 5-12 8-28 11-39l6 27c4-4 10-1 14 5 5-8 8-18 11-26l4 21c6-3 12 2 16 9 4-11 7-24 9-34l5 25c5-4 12-1 17 6 4-9 8-20 11-29l4 23c6-2 12 4 16 11 5-13 9-29 12-40l5 28c6-3 12 1 16 8 4-9 7-21 10-30l5 24c5-2 11 3 15 9 4-11 8-23 11-33l4 25c6-3 13 2 17 8 4-9 7-20 9-29l6 22c6-3 12 2 16 10 5-12 8-26 11-36l5 26c6-2 12 3 16 10 4-9 7-19 10-27l5 21c6-2 13 3 17 9 4-11 8-24 10-32l6 23c5-2 10 2 14 8V90H0Z"
            fill="currentColor"
          />
        </svg>

        <div className="colaai-ticket-brand-stack">
          <img src={ribbonSymbol} alt="" className="colaai-ticket-symbol" />
          <img src={logoWordmark} alt="ColaAí" className="colaai-ticket-wordmark" />
          <span className="colaai-ticket-label">INGRESSO</span>
        </div>
      </div>

      <div className="colaai-ticket-sheet">
        <div className="colaai-ticket-main">
          <div className="colaai-ticket-head">
            <h3>{ticket.event.title}</h3>
            <span className={ticketStatusClass[ticket.status]}>
              <strong>{ticketStatuses[ticket.status]}</strong>
            </span>
          </div>

          <ul className="colaai-ticket-details">
            <li>
              <CalendarIcon className="ticket-detail-icon" />
              <time dateTime={ticket.event.startsAt}>{formatTicketDate.format(startsAt)}</time>
            </li>
            <li>
              <ClockIcon className="ticket-detail-icon" />
              <span>{formatTicketTime.format(startsAt)}</span>
            </li>
            <li>
              <PinIcon className="ticket-detail-icon" />
              <span>{ticket.event.location}</span>
            </li>
            <li className="ticket-detail-lot">
              <TicketIcon className="ticket-detail-icon" />
              <span>{ticket.lot.name}</span>
            </li>
          </ul>
        </div>

        <div className="colaai-ticket-stub">
          <TicketQrCode value={ticket.code} className="colaai-ticket-qr" />
          <code className="history-code colaai-ticket-code">{ticket.code}</code>
        </div>
      </div>
    </div>
  )
}

function renderOrder(order: HistoryOrder, action: ReactNode) {
  return (
    <div className="order-card-body">
      <div className="colaai-ticket-head">
        <h3>{order.event.title}</h3>
        <span className="status-pill status-neutral">
          <strong>{orderStatuses[order.status]}</strong>
        </span>
      </div>
      <div className="card-meta-list">
        <p className="event-meta meta-row">
          <PinIcon className="meta-icon" />
          <span>{order.event.location}</span>
        </p>
        <p className="event-meta meta-row">
          <CalendarIcon className="meta-icon" />
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
    <section className="history-section" aria-labelledby={id}>
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
            Anterior
          </button>
          <span aria-live="polite">Página {page}{page <= totalPages ? ' de ' + totalPages : ''}</span>
          <button
            className="history-action"
            type="button"
            aria-disabled={!canGoForward}
            onClick={() => { if (canGoForward) setPage(page + 1) }}
          >
            Próxima
          </button>
        </nav>
      )}
    </section>
  )
}

export default function BuyerHistoryPage() {
  const [token] = useState(() => sessionStorage.getItem(sessionTokenKey))
  const [access, setAccess] = useState<HistoryAccess | null>(null)
  const [now, setNow] = useState(Date.now)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    if (!token || access) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [access, token])

  const handleAccess = useCallback((kind: HistoryAccess) => {
    if (kind === 'login' && sessionStorage.getItem(sessionTokenKey) === token) {
      sessionStorage.removeItem(sessionTokenKey)
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
          <p><Link to="/" className="back-link"><ArrowLeftIcon /> Voltar aos eventos</Link></p>
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
            renderItem={renderTicket}
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
    </AppLayout>
  )
}
