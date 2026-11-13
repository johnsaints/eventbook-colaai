import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import AppLayout from '../components/AppLayout'
import TicketSelection from '../components/TicketSelection'
import { formatDate, getEvent, type EventDetails } from '../events'
import type { ReservationDraft } from '../orders'

type DetailState = { id: string } & (
  | { status: 'ready'; event: EventDetails }
  | { status: 'not-found' | 'error' }
)

export default function EventPage() {
  const { eventId = '' } = useParams()
  const { state } = useLocation()
  const draft = (state as { reservationDraft?: ReservationDraft } | null)?.reservationDraft
  const initialItems = draft?.eventId === eventId && Array.isArray(draft.items) ? draft.items : []
  const [result, setResult] = useState<DetailState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const current = result?.id === eventId ? result : null
  const event = current?.status === 'ready' ? current.event : null

  useEffect(() => {
    const controller = new AbortController()

    async function loadEvent() {
      try {
        const found = await getEvent(eventId, controller.signal)
        if (controller.signal.aborted) return

        setResult(found
          ? { id: eventId, status: 'ready', event: found }
          : { id: eventId, status: 'not-found' })
      } catch {
        if (!controller.signal.aborted) setResult({ id: eventId, status: 'error' })
      }
    }

    void loadEvent()
    return () => controller.abort()
  }, [eventId, attempt])

  function retry() {
    headingRef.current?.focus()
    setResult(null)
    setAttempt(current => current + 1)
  }

  return (
    <AppLayout>
      <main className="catalog">
        <header className="page-header">
          <p><Link to="/" className="back-link">← Voltar aos eventos</Link></p>
          <h1 tabIndex={-1} ref={headingRef}>{event?.title ?? 'Detalhes do evento'}</h1>
          {event && (
            <div className="event-hero-meta">
              <p className="lead-text">{event.description}</p>
              <div className="meta-pills">
                <span className="meta-pill">📍 {event.location}</span>
                <span className="meta-pill">
                  🗓️ <time dateTime={event.startsAt}>{formatDate.format(new Date(event.startsAt))}</time>
                </span>
              </div>
            </div>
          )}
        </header>

        {!current && <p className="state-banner" role="status">Carregando evento…</p>}
        {current?.status === 'not-found' && <p className="state-banner state-error" role="alert">Evento não encontrado.</p>}
        {current?.status === 'error' && (
          <div className="state-banner state-error">
            <p role="alert">Não foi possível carregar o evento.</p>
            <button type="button" className="btn btn-secondary" onClick={retry}>Tentar novamente</button>
          </div>
        )}

        {event && <TicketSelection key={event.id} event={event} initialItems={initialItems} />}
      </main>
    </AppLayout>
  )
}
