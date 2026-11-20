import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import {
  canAccessBuyerTickets,
  canAccessCheckin,
  canAccessPanel,
  getCurrentUser,
  notifyUserUpdated,
  sessionTokenKey,
  type AuthUser,
} from '../api'
import AppLayout from '../components/AppLayout'
import Drawer from '../components/Drawer'
import { CalendarIcon, ChartIcon, PinIcon, PlusIcon, StarIcon, TicketIcon, UsersIcon } from '../components/Icons'
import {
  formatDate,
  getEventForEdit,
  getMyEvents,
  setEventFeatured,
  type EditableEvent,
  type OrganizerEvent,
} from '../events'
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

type OrganizerDrawerTab = 'edit' | 'lots' | 'staff' | 'occupancy'
type OrganizerDrawerState =
  | { kind: 'create' }
  | { kind: 'event'; eventId: string; tab: OrganizerDrawerTab }

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

  const [drawer, setDrawer] = useState<OrganizerDrawerState | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [editNotice, setEditNotice] = useState('')
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null)
  const editRequest = useRef<AbortController | null>(null)
  const featureRequest = useRef<AbortController | null>(null)

  useEffect(() => () => {
    editRequest.current?.abort()
    featureRequest.current?.abort()
  }, [])

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
          notifyUserUpdated(null)
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
    notifyUserUpdated(null)
    setPanel({ status: 'signed-out' })
  }, [])

  async function openEditor(eventId: string) {
    if (!token) return
    editRequest.current?.abort()
    const controller = new AbortController()
    editRequest.current = controller
    setEditNotice('')
    setEditing({ status: 'loading' })

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

  function closeDrawer() {
    editRequest.current?.abort()
    setEditing(null)
    setDrawer(null)
  }

  function openCreateDrawer() {
    editRequest.current?.abort()
    setEditing(null)
    setEditNotice('')
    setDrawer({ kind: 'create' })
  }

  function openEventDrawer(eventId: string, tab: OrganizerDrawerTab) {
    setEditNotice('')
    setDrawer({ kind: 'event', eventId, tab })
    if (tab === 'edit') {
      void openEditor(eventId)
    } else {
      editRequest.current?.abort()
      setEditing(null)
    }
  }

  function switchDrawerTab(tab: OrganizerDrawerTab) {
    if (drawer?.kind !== 'event') return
    setDrawer({ kind: 'event', eventId: drawer.eventId, tab })
    if (tab === 'edit') {
      if (editing?.status !== 'ready' || editing.event.id !== drawer.eventId) {
        void openEditor(drawer.eventId)
      }
    }
  }

  function savePanelEvent(event: OrganizerEvent) {
    const wasEdit = drawer?.kind === 'event' && drawer.tab === 'edit'
    setPanel((current) => {
      if (current.status !== 'ready') return current

      const events = [...current.events.filter((item) => item.id !== event.id), event].sort(
        (first, second) =>
          first.startsAt.localeCompare(second.startsAt) || first.id.localeCompare(second.id)
      )
      return { ...current, events }
    })

    setEditNotice(wasEdit ? 'Evento atualizado.' : 'Evento criado.')
    setEditing(null)
    setDrawer(null)
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

  async function toggleFeatured(event: OrganizerEvent) {
    if (!token || featureRequest.current) return
    const nextFeatured = !event.featured
    const controller = new AbortController()
    featureRequest.current = controller
    setTogglingFeaturedId(event.id)
    setEditNotice('')

    try {
      const updated = await setEventFeatured(event.id, nextFeatured, token, controller.signal)
      if (controller.signal.aborted) return
      if (!updated) {
        logout()
        return
      }
      setPanel((current) => {
        if (current.status !== 'ready') return current
        return {
          ...current,
          events: current.events.map((item) =>
            item.id === event.id ? { ...item, featured: updated.featured } : item
          ),
        }
      })
      setEditNotice(
        updated.featured
          ? `“${event.title}” adicionado aos Destaques da vitrine.`
          : `“${event.title}” removido dos Destaques da vitrine.`
      )
    } catch (error) {
      if (!controller.signal.aborted) {
        setEditNotice(error instanceof Error ? error.message : 'Não foi possível atualizar o destaque.')
      }
    } finally {
      featureRequest.current = null
      if (!controller.signal.aborted) setTogglingFeaturedId(null)
    }
  }

  if (!token || panel.status === 'signed-out') {
    return <Navigate to="/login" replace />
  }

  const myEvents = panel.status === 'ready' && canAccessPanel(panel.user.role)
    ? panel.events
    : null

  const isOrganizer = panel.status === 'ready' && panel.user.role === 'ORGANIZER'
  const drawerEvent = drawer?.kind === 'event'
    ? myEvents?.find((event) => event.id === drawer.eventId) ?? null
    : null
  const isCreateDrawer = drawer?.kind === 'create'
  const drawerOpen = Boolean(myEvents && (isCreateDrawer || drawerEvent))

  const statusPillClass: Record<OrganizerEvent['status'], string> = {
    DRAFT: 'status-pill status-neutral',
    PUBLISHED: 'status-pill status-valid',
    CANCELLED: 'status-pill status-cancelled',
  }

  const publishedCount = myEvents?.filter((e) => e.status === 'PUBLISHED').length ?? 0
  const draftCount = myEvents?.filter((e) => e.status === 'DRAFT').length ?? 0

  return (
    <AppLayout>
      <main className="catalog">
        <header className="page-header dashboard-header">
          <div>
            <span className="eyebrow">Área do organizador</span>
            <h1 tabIndex={-1} ref={panelHeadingRef}>Painel de eventos</h1>
          </div>
          {myEvents && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openCreateDrawer}
            >
              <PlusIcon />
              Novo evento
            </button>
          )}
        </header>

        {panel.status === 'loading' && <p className="state-banner" role="status">Carregando painel…</p>}
        {panel.status === 'error' && (
          <div className="state-banner state-error">
            <p role="alert">Não foi possível carregar o painel.</p>
            <button type="button" className="btn btn-secondary" onClick={retryPanel}>Tentar novamente</button>
          </div>
        )}

        {panel.status === 'ready' && (
          <section className="dashboard-summary">
            <div className="event-card dashboard-profile">
              {canAccessPanel(panel.user.role) ? (
                <>
                  {panel.user.role === 'ADMIN' && (
                    <p className="event-meta">
                      Modo Administrador: todos os eventos da plataforma estão visíveis para edição, lotes e publicação (equipe e ocupação permanecem exclusivos do organizador titular).
                    </p>
                  )}
                  {myEvents && (
                    <dl className="dashboard-kpis">
                      <div className="kpi-box">
                        <dt>Total</dt>
                        <dd>{myEvents.length}</dd>
                      </div>
                      <div className="kpi-box">
                        <dt>Publicados</dt>
                        <dd>{publishedCount}</dd>
                      </div>
                      <div className="kpi-box">
                        <dt>Rascunhos</dt>
                        <dd>{draftCount}</dd>
                      </div>
                    </dl>
                  )}
                </>
              ) : (
                <div>
                  <p className="form-alert" role="alert">Seu perfil não tem acesso ao painel.</p>
                  <div className="auth-actions">
                    <Link to="/" className="btn btn-secondary btn-sm">Voltar aos eventos</Link>
                    {canAccessBuyerTickets(panel.user.role) && (
                      <Link to="/meus-ingressos" className="btn btn-primary btn-sm">Meus Ingressos</Link>
                    )}
                    {canAccessCheckin(panel.user.role) && (
                      <Link to="/check-in" className="btn btn-primary btn-sm">Abrir check-in</Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {editNotice && <p className="form-status" role="status">{editNotice}</p>}

        {myEvents && (
          <section aria-labelledby="my-events-title" className="panel-events">
            <h2 id="my-events-title">
              {panel.status === 'ready' && panel.user.role === 'ADMIN' ? 'Eventos cadastrados' : 'Meus eventos'}
            </h2>
            {myEvents.length === 0 ? (
              <div className="state-banner">
                <p>Nenhum evento cadastrado ainda. Clique em “Novo evento” para começar.</p>
              </div>
            ) : (
              <ul className="event-list">
                {myEvents.map((event) => (
                  <li key={event.id}>
                    <article className="event-card organizer-event-card">
                      <div className="organizer-card-head">
                        <h3>{event.title}</h3>
                        <div className="organizer-head-pills">
                          {event.featured && (
                            <span className="ca-featured-pill">
                              <StarIcon width={12} height={12} />
                              Destaque
                            </span>
                          )}
                          <span className={statusPillClass[event.status]}>
                            {statusLabel[event.status]}
                          </span>
                        </div>
                      </div>
                      <div className="card-meta-list">
                        <p className="event-meta meta-row">
                          <PinIcon variant="gradient" className="meta-icon" />
                          <span>{event.location}</span>
                        </p>
                        <p className="event-meta meta-row">
                          <CalendarIcon variant="gradient" className="meta-icon" />
                          <time dateTime={event.startsAt}>
                            {formatDate.format(new Date(event.startsAt))}
                          </time>
                        </p>
                      </div>
                      <div className="event-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={`Editar ${event.title}`}
                          aria-expanded={drawer?.kind === 'event' && drawer.eventId === event.id && drawer.tab === 'edit'}
                          onClick={() => openEventDrawer(event.id, 'edit')}
                        >
                          Editar
                        </button>
                        <button
                          id={`lots-trigger-${event.id}`}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`Lotes de ${event.title}`}
                          aria-expanded={drawer?.kind === 'event' && drawer.eventId === event.id && drawer.tab === 'lots'}
                          onClick={() => openEventDrawer(event.id, 'lots')}
                        >
                          <TicketIcon />
                          Lotes
                        </button>
                        {isOrganizer && (
                          <button
                            id={`staff-trigger-${event.id}`}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={`Equipe de ${event.title}`}
                            aria-expanded={drawer?.kind === 'event' && drawer.eventId === event.id && drawer.tab === 'staff'}
                            onClick={() => openEventDrawer(event.id, 'staff')}
                          >
                            <UsersIcon />
                            Equipe
                          </button>
                        )}
                        {isOrganizer && (
                          <button
                            id={`occupancy-trigger-${event.id}`}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={`Ocupação de ${event.title}`}
                            aria-expanded={drawer?.kind === 'event' && drawer.eventId === event.id && drawer.tab === 'occupancy'}
                            onClick={() => openEventDrawer(event.id, 'occupancy')}
                          >
                            <ChartIcon />
                            Ocupação
                          </button>
                        )}
                        {panel.status === 'ready' && panel.user.role === 'ADMIN' && event.status === 'PUBLISHED' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={event.featured ? `Remover destaque de ${event.title}` : `Destacar ${event.title}`}
                            aria-pressed={Boolean(event.featured)}
                            disabled={togglingFeaturedId === event.id}
                            onClick={() => void toggleFeatured(event)}
                          >
                            <StarIcon width={14} height={14} variant={event.featured ? 'gradient' : 'current'} />
                            {event.featured ? 'Em destaque' : 'Destacar'}
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

        <Drawer
          open={drawerOpen}
          onClose={closeDrawer}
          side="right"
          size="lg"
          eyebrow={isCreateDrawer ? 'Cadastro de evento' : 'Gestão do evento'}
          title={isCreateDrawer ? 'Novo evento' : (drawerEvent?.title ?? 'Evento')}
          subtitle={drawerEvent ? `${drawerEvent.location} · ${formatDate.format(new Date(drawerEvent.startsAt))}` : undefined}
          headerExtra={drawerEvent && drawer?.kind === 'event' ? (
            <div className="drawer-tabs" role="tablist" aria-label="Seções do evento">
              <button
                type="button"
                role="tab"
                aria-selected={drawer.tab === 'edit'}
                className={drawer.tab === 'edit' ? 'drawer-tab active' : 'drawer-tab'}
                onClick={() => switchDrawerTab('edit')}
              >
                Dados do evento
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={drawer.tab === 'lots'}
                className={drawer.tab === 'lots' ? 'drawer-tab active' : 'drawer-tab'}
                onClick={() => switchDrawerTab('lots')}
              >
                <TicketIcon width={14} height={14} />
                Lotes
              </button>
              {isOrganizer && (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={drawer.tab === 'staff'}
                    className={drawer.tab === 'staff' ? 'drawer-tab active' : 'drawer-tab'}
                    onClick={() => switchDrawerTab('staff')}
                  >
                    <UsersIcon width={14} height={14} />
                    Equipe
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={drawer.tab === 'occupancy'}
                    className={drawer.tab === 'occupancy' ? 'drawer-tab active' : 'drawer-tab'}
                    onClick={() => switchDrawerTab('occupancy')}
                  >
                    <ChartIcon width={14} height={14} />
                    Ocupação
                  </button>
                </>
              )}
            </div>
          ) : undefined}
        >
          {isCreateDrawer ? (
            <EventForm
              key="new"
              token={token}
              onSaved={savePanelEvent}
              onSessionExpired={logout}
            />
          ) : drawerEvent && drawer?.kind === 'event' && (
            <>
              {drawer.tab === 'edit' && (
                <>
                  {editing?.status === 'loading' && <p role="status">Carregando evento…</p>}
                  {editing?.status === 'error' && <p className="form-alert" role="alert">{editing.message}</p>}
                  {editing?.status === 'ready' && (
                    <EventForm
                      key={editing.event.id}
                      token={token}
                      initialEvent={editing.event}
                      onSaved={savePanelEvent}
                      onSessionExpired={logout}
                    />
                  )}
                </>
              )}

              {drawer.tab === 'lots' && (
                <EventLotsPanel
                  key={`lots-${drawerEvent.id}`}
                  eventId={drawerEvent.id}
                  eventTitle={drawerEvent.title}
                  token={token}
                  onClose={closeDrawer}
                  onSessionExpired={logout}
                  embedded
                />
              )}

              {drawer.tab === 'staff' && isOrganizer && (
                <EventStaffPanel
                  key={`staff-${drawerEvent.id}`}
                  eventId={drawerEvent.id}
                  eventTitle={drawerEvent.title}
                  token={token}
                  onClose={closeDrawer}
                  onSessionExpired={logout}
                  embedded
                />
              )}

              {drawer.tab === 'occupancy' && isOrganizer && (
                <EventOccupancyPanel
                  key={`occupancy-${drawerEvent.id}`}
                  eventId={drawerEvent.id}
                  eventTitle={drawerEvent.title}
                  token={token}
                  onClose={closeDrawer}
                  onSessionExpired={logout}
                  embedded
                />
              )}
            </>
          )}
        </Drawer>
      </main>
    </AppLayout>
  )
}
