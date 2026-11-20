import { useEffect, useRef, useState } from 'react'
import { getEventOccupancy, type EventOccupancy, type OccupancyMetrics } from '../occupancy'
import './EventOccupancyPanel.css'

type Props = {
  eventId: string
  eventTitle: string
  token: string
  onClose: () => void
  onSessionExpired: () => void
  embedded?: boolean
}

type OccupancyState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EventOccupancy }

const formatCount = new Intl.NumberFormat('pt-BR')
const formatPercent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 })

function OccupancySummary({ totals }: { totals: OccupancyMetrics }) {
  return (
    <dl className="occupancy-summary">
      <div className="event-card">
        <dt>Ingressos cadastrados</dt>
        <dd>{formatCount.format(totals.totalTickets)}</dd>
      </div>
      <div className="event-card">
        <dt>Ingressos vendidos</dt>
        <dd>{formatCount.format(totals.soldTickets)}</dd>
      </div>
      <div className="event-card">
        <dt>Check-ins</dt>
        <dd>{formatCount.format(totals.checkIns)}</dd>
      </div>
      <div className="event-card">
        <dt>Taxa de ocupação</dt>
        <dd>{formatPercent.format(totals.occupancyPercentage / 100)}</dd>
      </div>
    </dl>
  )
}

export default function EventOccupancyPanel({ eventId, eventTitle, token, onClose, onSessionExpired, embedded = false }: Props) {
  const [state, setState] = useState<OccupancyState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const data = await getEventOccupancy(eventId, token, controller.signal)
        if (controller.signal.aborted) return
        if (!data) {
          onSessionExpired()
          return
        }
        setState({ status: 'ready', data })
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: error instanceof TypeError
              ? 'Não foi possível conectar à API.'
              : error instanceof Error ? error.message : 'Não foi possível carregar a ocupação.',
          })
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [eventId, token, onSessionExpired, revision])

  function reload() {
    if (state.status === 'loading') return
    setState({ status: 'loading' })
    setRevision(current => current + 1)
  }

  return (
    <section
      className={embedded ? 'drawer-embedded-panel occupancy-panel' : 'panel-events occupancy-panel'}
      aria-labelledby={embedded ? undefined : 'occupancy-panel-title'}
      aria-label={embedded ? `Ocupação de ${eventTitle}` : undefined}
    >
      {!embedded && (
        <h2 id="occupancy-panel-title" tabIndex={-1} ref={headingRef}>Ocupação de {eventTitle}</h2>
      )}
      <p className="event-meta">A taxa compara os check-ins com o estoque cadastrado nos lotes.</p>
      <div className="event-actions occupancy-actions">
        {!embedded && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Fechar ocupação</button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload} aria-disabled={state.status === 'loading'}>
          {state.status === 'error' ? 'Tentar novamente' : 'Atualizar dados'}
        </button>
      </div>

      {state.status === 'loading' && <p role="status">Carregando ocupação…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' && (
        <>
          <OccupancySummary totals={state.data.totals} />
          {state.data.lots.length === 0 ? (
            <p>Este evento ainda não tem lotes cadastrados.</p>
          ) : (
            <div className="event-card occupancy-chart">
              <h3>Ocupação por lote</h3>
              <ul className="occupancy-lots">
                {state.data.lots.map(lot => (
                  <li key={lot.id}>
                    <div className="occupancy-lot-title">
                      <strong>{lot.name}</strong>
                      <strong>{formatPercent.format(lot.occupancyPercentage / 100)}</strong>
                    </div>
                    <div className="occupancy-bar" aria-hidden="true">
                      <div className="occupancy-bar-fill" style={{ width: `${Math.min(lot.occupancyPercentage, 100)}%` }} />
                    </div>
                    <p className="event-meta">
                      {formatCount.format(lot.checkIns)} de {formatCount.format(lot.totalTickets)} ingressos com check-in
                      {' · '}{formatCount.format(lot.soldTickets)} vendidos
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
