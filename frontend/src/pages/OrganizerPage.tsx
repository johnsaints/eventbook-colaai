import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { canAccessPanel, getCurrentUser, sessionTokenKey, type AuthUser } from '../api'
import AppLayout from '../components/AppLayout'
import { formatDate, getEventForEdit, getMyEvents, type EditableEvent, type OrganizerEvent } from '../events'
import EventForm from '../components/EventForm'
import EventLotsPanel from '../components/EventLotsPanel'
import EventStaffPanel from '../components/EventStaffPanel'
import EventOccupancyPanel from '../components/EventOccupancyPanel'
import PublishEventAction from '../components/PublishEventAction'

type PanelState =
  | { status: 'loading' | 'signed-out' | 'error' }
  | { status: 'ready'; user: AuthUser; events: OrganizerEvent[] }

type EditState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: EditableEvent }

const statusLabel: Record<OrganizerEvent['status'], string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  CANCELLED: 'Cancelado',
}

export default function OrganizerPage() {
  const [token] = useState(() => sessionStorage.getItem(sessionTokenKey))
  const [panel, setPanel] = useState<PanelState>({ status: 'loading' })
  const [panelAttempt, setPanelAttempt] = useState(0)
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)

  const [lotsEventId, setLotsEventId] = useState<string | null>(null)
  const [staffEventId, setStaffEventId] = useState<string | null>(null)
  const [occupancyEventId, setOccupancyEventId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [editNotice, setEditNotice] = useState('')
  const editRequest = useRef<AbortController | null>(null)

  useEffect(() => () => editRequest.current?.abort(), [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()

    async function loadPanel(sessionToken: string) {
      try {
        const user = await getCurrentUser(sessionToken, controller.signal)
        const events = user && canAccessPanel(user.role)
          ? await getMyEvents(sessionToken, controller.signal)
          : []

        if (controller.signal.aborted) return

        if (!user || events === null) {
          sessionStorage.removeItem(sessionTokenKey)
          setPanel({ status: 'signed-out' })
          return
        }

        setPanel({ status: 'ready', user, events })
      } catch {
        if (!controller.signal.aborted) setPanel({ status: 'error' })
      }
    }

    void loadPanel(token)
    return () => controller.abort()
  }, [token, panelAttempt])

  function retryPanel() {
    panelHeadingRef.current?.focus()
    setPanel({ status: 'loading' })
    setPanelAttempt(current => current + 1)
  }

  const logout = useCallback(() => {
    sessionStorage.removeItem(sessionTokenKey)
    setPanel({ status: 'signed-out' })
  }, [])

  async function openEditor(eventId: string) {
    if (!token) return
    editRequest.current?.abort()
    const controller = new AbortController()
    editRequest.current = controller
    setEditNotice('')
    setEditing({ status: 'loading' })
    requestAnimationFrame(() => document.getElementById('event-form-title')?.focus())

    try {
      const event = await getEventForEdit(eventId, token, controller.signal)
      if (controller.signal.aborted) return
      if (!event) {
        logout()
        return
      }
      setEditing({ status: 'ready', event })
    } catch (error) {
      if (!controller.signal.aborted) {
        setEditing({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível abrir o evento.',
        })
      }
    }
  }

  function cancelEdit() {
    editRequest.current?.abort()
    setEditing(null)
  }

  function savePanelEvent(event: OrganizerEvent) {
    setPanel((current) => {
      if (current.status !== 'ready') return current

      const events = [...current.events.filter((item) => item.id !== event.id), event].sort(
        (first, second) =>
          first.startsAt.localeCompare(second.startsAt) || first.id.localeCompare(second.id)
      )
      return { ...current, events }
    })

    setEditNotice(editing ? 'Evento atualizado.' : '')
    setEditing(null)
  }

  function markPublished(eventId: string) {
    setPanel((current) => {
      if (current.status !== 'ready') return current

      const events = current.events.map((event) =>
        event.id === eventId ? { ...event, status: 'PUBLISHED' as const } : event
      )
      return { ...current, events }
    })
  }

  if (!token || panel.status === 'signed-out') {
    return <Navigate to="/login" replace />
  }

  const myEvents = panel.status === 'ready' && canAccessPanel(panel.user.role)
    ? panel.events
    : null

  const lotsEvent = myEvents?.find((event) => event.id === lotsEventId) ?? null
  const isOrganizer = panel.status === 'ready' && panel.user.role === 'ORGANIZER'
  const staffEvent = isOrganizer ? myEvents?.find((event) => event.id === staffEventId) : null
  const occupancyEvent = isOrganizer ? myEvents?.find((event) => event.id === occupancyEventId) : null

  return (
    <AppLayout>
      <main className="catalog">
        <header className="page-header">
          <p><Link to="/" className="back-link">← Voltar aos eventos</Link></p>
          <h1 tabIndex={-1} ref={panelHeadingRef}>Painel de eventos</h1>
        </header>

      {panel.status === 'loading' && <p role="status">Carregando painel…</p>}
      {panel.status === 'error' && (
        <>
          <p role="alert">Não foi possível carregar o painel.</p>
          <button type="button" onClick={retryPanel}>Tentar novamente</button>
        </>
      )}

      {panel.status === 'ready' && (
        <section className="event-card auth-form">
          {canAccessPanel(panel.user.role) ? (
            <>
              <h2>Olá, {panel.user.name}</h2>
              <p>Perfil: {panel.user.role}</p>
            </>
          ) : (
            <p role="alert">Seu perfil não tem acesso ao painel.</p>
          )}
          <button type="button" onClick={logout}>Sair</button>
        </section>
      )}

      {myEvents && (
        <section aria-labelledby="event-form-title" className="panel-events">
          <h2 id="event-form-title" tabIndex={-1}>{editing ? 'Editar evento' : 'Novo evento'}</h2>
          {editNotice && <p role="status">{editNotice}</p>}
          {editing && <button type="button" onClick={cancelEdit}>Cancelar edição</button>}
          {editing?.status === 'loading' && <p role="status">Carregando evento…</p>}
          {editing?.status === 'error' && <p role="alert">{editing.message}</p>}
          {(!editing || editing.status === 'ready') && (
            <EventForm
              key={editing?.event.id ?? 'new'}
              token={token}
              initialEvent={editing?.event}
              onSaved={savePanelEvent}
              onSessionExpired={logout}
            />
          )}
        </section>
      )}

      {myEvents && (
        <section aria-labelledby="my-events-title" className="panel-events">
          <h2 id="my-events-title">Meus eventos</h2>
          {myEvents.length === 0 ? (
            <p>Nenhum evento cadastrado.</p>
          ) : (
            <ul className="event-list">
              {myEvents.map((event) => (
                <li key={event.id}>
                  <article className="event-card">
                    <h3>{event.title}</h3>
                    <p>Status: {statusLabel[event.status]}</p>
                    <p className="event-meta">{event.location}</p>
                    <p className="event-meta">
                      <time dateTime={event.startsAt}>
                        {formatDate.format(new Date(event.startsAt))}
                      </time>
                    </p>
                    <div className="event-actions">
                      <button type="button" aria-label={`Editar ${event.title}`} onClick={() => void openEditor(event.id)}>
                        Editar
                      </button>
                      <button
                        id={`lots-trigger-${event.id}`}
                        type="button"
                        aria-label={`Ver lotes de ${event.title}`}
                        aria-expanded={lotsEventId === event.id}
                        onClick={() => setLotsEventId((current) => current === event.id ? null : event.id)}
                      >
                        Ver lotes
                      </button>
                      {isOrganizer && (
                        <button
                          id={`staff-trigger-${event.id}`}
                          type="button"
                          aria-label={`Gerenciar equipe de ${event.title}`}
                          aria-expanded={staffEventId === event.id}
                          onClick={() => setStaffEventId(current => current === event.id ? null : event.id)}
                        >
                          Gerenciar equipe
                        </button>
                      )}
                      {isOrganizer && (
                        <button
                          id={`occupancy-trigger-${event.id}`}
                          type="button"
                          aria-label={`Ver ocupação de ${event.title}`}
                          aria-expanded={occupancyEventId === event.id}
                          onClick={() => setOccupancyEventId(current => current === event.id ? null : event.id)}
                        >
                          Ver ocupação
                        </button>
                      )}
                      <PublishEventAction
                        event={event}
                        token={token}
                        onPublished={markPublished}
                        onSessionExpired={logout}
                      />
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {lotsEvent && (
        <EventLotsPanel
          key={'lots-' + lotsEvent.id}
          eventId={lotsEvent.id}
          eventTitle={lotsEvent.title}
          token={token}
          onClose={() => {
            setLotsEventId(null)
            document.getElementById(`lots-trigger-${lotsEvent.id}`)?.focus()
          }}
          onSessionExpired={logout}
        />
      )}

      {staffEvent && (
        <EventStaffPanel
          key={'staff-' + staffEvent.id}
          eventId={staffEvent.id}
          eventTitle={staffEvent.title}
          token={token}
          onClose={() => {
            setStaffEventId(null)
            document.getElementById(`staff-trigger-${staffEvent.id}`)?.focus()
          }}
          onSessionExpired={logout}
        />
      )}
      {occupancyEvent && (
        <EventOccupancyPanel
          key={'occupancy-' + occupancyEvent.id}
          eventId={occupancyEvent.id}
          eventTitle={occupancyEvent.title}
          token={token}
          onClose={() => {
            setOccupancyEventId(null)
            document.getElementById(`occupancy-trigger-${occupancyEvent.id}`)?.focus()
          }}
          onSessionExpired={logout}
        />
      )}
      </main>
    </AppLayout>
  )
}
