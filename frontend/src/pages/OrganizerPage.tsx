import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import {
  canAccessBuyerTickets,
  canAccessCheckin,
  canAccessPanel,
  clearSession,
  getCurrentUser,
  getSessionToken,
  type AuthUser,
} from '../api'
import AppLayout from '../components/AppLayout'
import Drawer from '../components/Drawer'
import {
  ArchiveIcon,
  CalendarIcon,
  ChartIcon,
  EyeOffIcon,
  PinIcon,
  PlusIcon,
  SlidersIcon,
  StarIcon,
  TicketIcon,
  TrashIcon,
  UsersIcon,
} from '../components/Icons'
import {
  formatDate,
  getEventForEdit,
  getMyEvents,
  removeOrArchiveEvent,
  setEventFeatured,
  unpublishEvent,
  type EditableEvent,
  type OrganizerEvent,
} from '../events'
import { scrollElementToTop } from '../scroll'
import { listOrganizerDefaultStaff } from '../staff'
import EventForm from '../components/EventForm'
import EventLotsPanel from '../components/EventLotsPanel'
import EventOccupancyPanel from '../components/EventOccupancyPanel'
import EventStaffPanel from '../components/EventStaffPanel'
import OrganizerTeamPanel from '../components/OrganizerTeamPanel'
import PublishEventAction from '../components/PublishEventAction'

type PanelState =
  | { status: 'loading' | 'signed-out' | 'error' }
  | { status: 'ready'; user: AuthUser; events: OrganizerEvent[] }

type EditState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: EditableEvent }

type OrganizerDrawerTab = 'edit' | 'lots' | 'staff' | 'occupancy'
type OrganizerEventFilter = 'active' | 'published' | 'draft' | 'featured' | 'archived'
type OrganizerDrawerState =
  | { kind: 'create' }
  | { kind: 'team' }
  | { kind: 'event'; eventId: string; tab: OrganizerDrawerTab; autoCreateLot?: boolean; lotGuidance?: string }

const countFormat = new Intl.NumberFormat('pt-BR')

const statusLabel: Record<OrganizerEvent['status'], string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  CANCELLED: 'Arquivado',
}

export default function OrganizerPage() {
  const [token] = useState(() => getSessionToken())
  const [panel, setPanel] = useState<PanelState>({ status: 'loading' })
  const [panelAttempt, setPanelAttempt] = useState(0)
  const [mountNow] = useState(() => Date.now())
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const eventsSectionRef = useRef<HTMLElement>(null)

  const [drawer, setDrawer] = useState<OrganizerDrawerState | null>(null)
  const [defaultStaffCount, setDefaultStaffCount] = useState(0)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [editNotice, setEditNotice] = useState('')
  const [eventFilter, setEventFilter] = useState<OrganizerEventFilter>('active')
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [busyEventActionId, setBusyEventActionId] = useState<string | null>(null)
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null)
  const editRequest = useRef<AbortController | null>(null)
  const featureRequest = useRef<AbortController | null>(null)
  const actionRequest = useRef<AbortController | null>(null)

  useEffect(() => () => {
    editRequest.current?.abort()
    featureRequest.current?.abort()
    actionRequest.current?.abort()
  }, [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()

    async function loadPanel(sessionToken: string) {
      try {
        const user = await getCurrentUser(sessionToken, controller.signal)
        const [events, defaultTeam] = user && canAccessPanel(user.role)
          ? await Promise.all([
              getMyEvents(sessionToken, controller.signal),
              user.role === 'ORGANIZER'
                ? listOrganizerDefaultStaff(sessionToken, controller.signal).catch(() => [])
                : Promise.resolve([]),
            ])
          : [[], []]

        if (controller.signal.aborted) return

        if (!user || events === null) {
          clearSession(sessionToken)
          setPanel({ status: 'signed-out' })
          return
        }

        if (Array.isArray(defaultTeam)) {
          setDefaultStaffCount(defaultTeam.length)
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
    clearSession(token ?? undefined)
    setPanel({ status: 'signed-out' })
  }, [token])

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
    setConfirmingRemoveId(null)
    setDrawer({ kind: 'create' })
  }

  function openTeamDrawer() {
    editRequest.current?.abort()
    setEditing(null)
    setEditNotice('')
    setConfirmingRemoveId(null)
    setDrawer({ kind: 'team' })
  }

  function openEventDrawer(eventId: string, tab: OrganizerDrawerTab) {
    setEditNotice('')
    setConfirmingRemoveId(null)
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
    const isNewEvent = drawer?.kind === 'create'
    setPanel((current) => {
      if (current.status !== 'ready') return current

      const existing = current.events.find((item) => item.id === event.id)
      const mergedEvent: OrganizerEvent = {
        ...event,
        hasSales: event.hasSales ?? existing?.hasSales ?? false,
        soldTickets: event.soldTickets ?? existing?.soldTickets ?? 0,
        reservedTickets: event.reservedTickets ?? existing?.reservedTickets ?? 0,
        lotsCount: event.lotsCount ?? existing?.lotsCount ?? 0,
        staffCount: event.staffCount ?? existing?.staffCount ?? 0,
      }
      const events = [...current.events.filter((item) => item.id !== event.id), mergedEvent].sort(
        (first, second) =>
          first.startsAt.localeCompare(second.startsAt) || first.id.localeCompare(second.id)
      )
      return { ...current, events }
    })

    setEditing(null)
    if (isNewEvent) {
      setEventFilter('active')
      const staffCount = event.staffCount ?? 0
      const staffNote = staffCount > 0
        ? ` com ${staffCount} ${staffCount === 1 ? 'integrante da equipe padrão vinculado' : 'integrantes da equipe padrão vinculados'}`
        : ''
      setEditNotice(`Evento criado${staffNote}! Cadastre pelo menos um lote para poder publicá-lo.`)
      setDrawer({
        kind: 'event',
        eventId: event.id,
        tab: 'lots',
        autoCreateLot: true,
        lotGuidance: `Evento criado${staffNote}! Cadastre pelo menos um lote para liberar a publicação.`,
      })
      return
    }

    setEditNotice('Evento atualizado.')
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

  async function handleUnpublish(event: OrganizerEvent) {
    if (!token || actionRequest.current) return
    const controller = new AbortController()
    actionRequest.current = controller
    setBusyEventActionId(event.id)
    setConfirmingRemoveId(null)
    setEditNotice('')

    try {
      const updated = await unpublishEvent(event.id, token, controller.signal)
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
            item.id === event.id ? { ...item, status: 'DRAFT' as const, featured: false } : item
          ),
        }
      })
      setEditNotice(`“${event.title}” ocultado da vitrine e movido para rascunhos.`)
    } catch (error) {
      if (!controller.signal.aborted) {
        setEditNotice(error instanceof Error ? error.message : 'Não foi possível ocultar o evento.')
      }
    } finally {
      actionRequest.current = null
      if (!controller.signal.aborted) setBusyEventActionId(null)
    }
  }

  async function handleRemoveOrArchive(event: OrganizerEvent) {
    if (!token || actionRequest.current) return
    const controller = new AbortController()
    actionRequest.current = controller
    setBusyEventActionId(event.id)
    setEditNotice('')

    try {
      const result = await removeOrArchiveEvent(event.id, token, controller.signal)
      if (controller.signal.aborted) return
      if (!result) {
        logout()
        return
      }
      setPanel((current) => {
        if (current.status !== 'ready') return current
        if (result.action === 'DELETED') {
          return {
            ...current,
            events: current.events.filter((item) => item.id !== event.id),
          }
        }
        return {
          ...current,
          events: current.events.map((item) =>
            item.id === event.id ? { ...item, status: 'CANCELLED' as const, featured: false } : item
          ),
        }
      })
      setConfirmingRemoveId(null)
      if (drawer?.kind === 'event' && drawer.eventId === event.id && result.action === 'DELETED') {
        closeDrawer()
      }
      setEditNotice(result.message)
    } catch (error) {
      if (!controller.signal.aborted) {
        setEditNotice(error instanceof Error ? error.message : 'Não foi possível remover o evento.')
      }
    } finally {
      actionRequest.current = null
      if (!controller.signal.aborted) setBusyEventActionId(null)
    }
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
  const isTeamDrawer = drawer?.kind === 'team' && isOrganizer
  const drawerOpen = Boolean(myEvents && (isCreateDrawer || isTeamDrawer || drawerEvent))

  const statusPillClass: Record<OrganizerEvent['status'], string> = {
    DRAFT: 'status-pill status-neutral',
    PUBLISHED: 'status-pill status-valid',
    CANCELLED: 'status-pill status-cancelled',
  }

  const publishedEvents = myEvents?.filter((e) => e.status === 'PUBLISHED') ?? []
  const draftEvents = myEvents?.filter((e) => e.status === 'DRAFT') ?? []
  const activeEvents = myEvents?.filter((e) => e.status !== 'CANCELLED') ?? []
  const archivedEvents = myEvents?.filter((e) => e.status === 'CANCELLED') ?? []
  const featuredEvents = publishedEvents.filter((e) => e.featured)

  const publishedCount = publishedEvents.length
  const draftCount = draftEvents.length
  const archivedCount = archivedEvents.length
  const featuredCount = featuredEvents.length

  const totalSold = activeEvents.reduce((sum, item) => sum + (item.soldTickets ?? 0), 0)
  const totalCapacity = activeEvents.reduce((sum, item) => sum + (item.capacity ?? 0), 0)
  const occupancyPct = totalCapacity > 0 ? Math.min(100, Math.round((totalSold / totalCapacity) * 100)) : 0
  const publishedPct = activeEvents.length > 0 ? Math.round((publishedCount / activeEvents.length) * 100) : 0
  const upcomingPublished = publishedEvents.find((e) => new Date(e.startsAt).getTime() > mountNow) ?? publishedEvents[0] ?? null

  const effectiveFilter: OrganizerEventFilter =
    eventFilter === 'archived' && archivedCount === 0 ? 'active' : eventFilter

  const visibleEvents =
    effectiveFilter === 'published'
      ? publishedEvents
      : effectiveFilter === 'draft'
        ? draftEvents
        : effectiveFilter === 'featured'
          ? featuredEvents
          : effectiveFilter === 'archived'
            ? archivedEvents
            : activeEvents

  function selectPanelFilter(nextFilter: OrganizerEventFilter, shouldScroll = false) {
    setEventFilter(nextFilter)
    setConfirmingRemoveId(null)
    if (shouldScroll) {
      scrollElementToTop(eventsSectionRef.current)
    }
  }

  function updateEventStaffCount(eventId: string, staffCount: number) {
    setPanel((current) => {
      if (current.status !== 'ready') return current
      return {
        ...current,
        events: current.events.map((item) =>
          item.id === eventId ? { ...item, staffCount } : item
        ),
      }
    })
  }

  const emptyFilterMessages: Record<OrganizerEventFilter, string> = {
    active: 'Nenhum evento ativo cadastrado ainda. Clique em “Novo evento” para começar.',
    published: 'Nenhum evento publicado no momento.',
    draft: 'Nenhum rascunho pendente no momento.',
    featured: 'Nenhum evento em destaque na página inicial ainda.',
    archived: 'Nenhum evento arquivado.',
  }

  return (
    <AppLayout>
      <main className="catalog">
        <header className="page-header dashboard-header">
          <div>
            <span className="eyebrow">Área do organizador</span>
            <h1 tabIndex={-1} ref={panelHeadingRef}>Painel de eventos</h1>
          </div>
          {myEvents && (
            <div className="dashboard-header-actions">
              {isOrganizer && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openTeamDrawer}
                >
                  <UsersIcon width={16} height={16} />
                  <span>Minha equipe</span>
                  {defaultStaffCount > 0 && (
                    <span className="header-count-pill">{defaultStaffCount}</span>
                  )}
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreateDrawer}
              >
                <PlusIcon />
                Novo evento
              </button>
            </div>
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
          <section className="dashboard-summary" aria-label="Indicadores do painel">
            {canAccessPanel(panel.user.role) ? (
              <>
                {panel.user.role === 'ADMIN' && (
                  <div className="admin-mode-strip" role="note">
                    <span className="role-badge">Administrador</span>
                    <p>
                      Todos os eventos da plataforma estão visíveis para gestão, lotes, destaque e publicação (equipe e ocupação permanecem exclusivos do organizador titular).
                    </p>
                  </div>
                )}

                {myEvents && (
                  <div className="dashboard-bento-grid">
                    <button
                      type="button"
                      className="kpi-card kpi-card-interactive"
                      onClick={() => selectPanelFilter('active', true)}
                    >
                      <div className="kpi-card-top">
                        <span className="kpi-card-label">Eventos ativos</span>
                        <span className="kpi-card-icon" aria-hidden="true">
                          <CalendarIcon width={16} height={16} variant="gradient" />
                        </span>
                      </div>
                      <div className="kpi-card-value-row">
                        <strong className="kpi-card-value">{activeEvents.length}</strong>
                      </div>
                      <p className="kpi-card-sub">
                        {publishedCount} publicados · {draftCount} rascunhos
                      </p>
                      <div className="kpi-progress-track" aria-hidden="true">
                        <div className="kpi-progress-fill" style={{ width: `${publishedPct}%` }} />
                      </div>
                    </button>

                    <div className="kpi-card kpi-card-emerald">
                      <div className="kpi-card-top">
                        <span className="kpi-card-label">Vendas & Ocupação</span>
                        <span className="kpi-card-icon" aria-hidden="true">
                          <TicketIcon width={16} height={16} />
                        </span>
                      </div>
                      <div className="kpi-card-value-row">
                        <strong className="kpi-card-value">{countFormat.format(totalSold)}</strong>
                        <span className="kpi-card-pct">{occupancyPct}%</span>
                      </div>
                      <p className="kpi-card-sub">
                        de {countFormat.format(totalCapacity)} vagas totais
                      </p>
                      <div className="kpi-progress-track" aria-hidden="true">
                        <div className="kpi-progress-fill" style={{ width: `${occupancyPct}%` }} />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="kpi-card kpi-card-gold kpi-card-interactive"
                      onClick={() => selectPanelFilter('featured', true)}
                    >
                      <div className="kpi-card-top">
                        <span className="kpi-card-label">Destaques na Home</span>
                        <span className="kpi-card-icon" aria-hidden="true">
                          <StarIcon width={16} height={16} />
                        </span>
                      </div>
                      <div className="kpi-card-value-row">
                        <strong className="kpi-card-value">{featuredCount}</strong>
                      </div>
                      <p className="kpi-card-sub">Exibidos no topo da vitrine</p>
                    </button>

                    <div className="kpi-card kpi-card-spotlight">
                      <div className="kpi-card-top">
                        <span className="kpi-card-label">Próximo evento</span>
                        <span className="kpi-card-icon" aria-hidden="true">
                          <ChartIcon width={16} height={16} />
                        </span>
                      </div>
                      {upcomingPublished ? (
                        <>
                          <h2 className="kpi-spotlight-title">{upcomingPublished.title}</h2>
                          <p className="kpi-spotlight-meta">
                            {formatDate.format(new Date(upcomingPublished.startsAt))} · {upcomingPublished.location}
                          </p>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEventDrawer(upcomingPublished.id, 'edit')}
                          >
                            <SlidersIcon width={14} height={14} />
                            Abrir gestão
                          </button>
                        </>
                      ) : (
                        <>
                          <h2 className="kpi-spotlight-title">Nenhum evento publicado</h2>
                          <p className="kpi-spotlight-meta">Crie ou publique um evento com lotes ativos.</p>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={openCreateDrawer}
                          >
                            <PlusIcon width={14} height={14} />
                            Criar evento
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="event-card">
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
          </section>
        )}

        {editNotice && <p className="form-status" role="status">{editNotice}</p>}

        {myEvents && (
          <section aria-labelledby="my-events-title" className="panel-events" ref={eventsSectionRef}>
            <div className="panel-events-header">
              <h2 id="my-events-title">
                {panel.status === 'ready' && panel.user.role === 'ADMIN' ? 'Eventos cadastrados' : 'Meus eventos'}
              </h2>
              <div className="panel-filter-tabs" role="tablist" aria-label="Filtrar eventos por situação">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveFilter === 'active'}
                  className={effectiveFilter === 'active' ? 'drawer-tab active' : 'drawer-tab'}
                  onClick={() => selectPanelFilter('active')}
                >
                  Ativos ({activeEvents.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveFilter === 'published'}
                  className={effectiveFilter === 'published' ? 'drawer-tab active' : 'drawer-tab'}
                  onClick={() => selectPanelFilter('published')}
                >
                  Publicados ({publishedCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveFilter === 'draft'}
                  className={effectiveFilter === 'draft' ? 'drawer-tab active' : 'drawer-tab'}
                  onClick={() => selectPanelFilter('draft')}
                >
                  Rascunhos ({draftCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveFilter === 'featured'}
                  className={effectiveFilter === 'featured' ? 'drawer-tab active' : 'drawer-tab'}
                  onClick={() => selectPanelFilter('featured')}
                >
                  Destaques ({featuredCount})
                </button>
                {archivedCount > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveFilter === 'archived'}
                    className={effectiveFilter === 'archived' ? 'drawer-tab active' : 'drawer-tab'}
                    onClick={() => selectPanelFilter('archived')}
                  >
                    Arquivados ({archivedCount})
                  </button>
                )}
              </div>
            </div>

            {visibleEvents.length === 0 ? (
              <div className="state-banner">
                <p>{emptyFilterMessages[effectiveFilter]}</p>
              </div>
            ) : (
              <ul className="event-list">
                {visibleEvents.map((event) => {
                  const isBusy = busyEventActionId === event.id
                  const isConfirming = confirmingRemoveId === event.id
                  const soldCount = event.soldTickets ?? 0
                  const totalCap = event.capacity ?? 0
                  const staffCount = event.staffCount ?? 0

                  return (
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

                        <div className="organizer-metrics-row">
                          <span className="organizer-metric-chip">
                            <TicketIcon width={13} height={13} />
                            {countFormat.format(soldCount)} / {countFormat.format(totalCap)} vendidos
                          </span>
                          {isOrganizer && event.status !== 'CANCELLED' && (
                            staffCount === 0 ? (
                              <button
                                type="button"
                                className="organizer-staff-warning"
                                onClick={() => openEventDrawer(event.id, 'staff')}
                                title="Vincule uma conta STAFF na aba Equipe para liberar este evento na tela de Check-in"
                              >
                                <UsersIcon width={13} height={13} />
                                Sem equipe de check-in
                              </button>
                            ) : (
                              <span className="organizer-metric-chip">
                                <UsersIcon width={13} height={13} />
                                Equipe: {staffCount}
                              </span>
                            )
                          )}
                        </div>

                        <div className="event-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-label={`Gestão do Evento ${event.title}`}
                            aria-expanded={drawer?.kind === 'event' && drawer.eventId === event.id}
                            onClick={() => openEventDrawer(event.id, 'edit')}
                          >
                            <SlidersIcon width={14} height={14} />
                            Gestão do Evento
                          </button>

                          {event.status === 'PUBLISHED' && (
                            <button
                              type="button"
                              className={event.featured ? 'btn btn-featured-active btn-sm' : 'btn btn-ghost btn-sm'}
                              aria-label={event.featured ? `Remover destaque de ${event.title}` : `Destacar ${event.title}`}
                              aria-pressed={Boolean(event.featured)}
                              disabled={togglingFeaturedId === event.id}
                              onClick={() => void toggleFeatured(event)}
                            >
                              <StarIcon width={14} height={14} variant={event.featured ? 'gradient' : 'current'} />
                              {event.featured ? 'Em destaque' : 'Destaque'}
                            </button>
                          )}

                          <PublishEventAction
                            event={event}
                            token={token}
                            onPublished={markPublished}
                            onSessionExpired={logout}
                          />

                          {event.status === 'PUBLISHED' && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={`Ocultar ${event.title}`}
                              disabled={isBusy}
                              onClick={() => void handleUnpublish(event)}
                            >
                              <EyeOffIcon width={14} height={14} />
                              {isBusy ? 'Ocultando…' : 'Ocultar'}
                            </button>
                          )}

                          {event.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              className="btn btn-danger-ghost btn-sm"
                              aria-label={event.hasSales ? `Arquivar ${event.title}` : `Excluir ${event.title}`}
                              aria-expanded={isConfirming}
                              disabled={isBusy}
                              onClick={() => setConfirmingRemoveId((current) => (current === event.id ? null : event.id))}
                            >
                              {event.hasSales ? <ArchiveIcon width={14} height={14} /> : <TrashIcon width={14} height={14} />}
                              {event.hasSales ? 'Arquivar' : 'Excluir'}
                            </button>
                          )}
                        </div>

                        {isConfirming && (
                          <div className="organizer-confirm-box" role="region" aria-label={`Confirmar ação para ${event.title}`}>
                            <p className="event-meta">
                              {event.hasSales
                                ? 'Este evento já possui pedidos/ingressos. Deseja arquivá-lo para ocultar da vitrine mantendo o histórico?'
                                : 'Excluir este evento permanentemente?'}
                            </p>
                            <div className="history-confirm-actions">
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={isBusy}
                                onClick={() => void handleRemoveOrArchive(event)}
                              >
                                {isBusy
                                  ? 'Processando…'
                                  : event.hasSales
                                    ? 'Confirmar arquivamento'
                                    : 'Confirmar exclusão'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={isBusy}
                                onClick={() => setConfirmingRemoveId(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        <Drawer
          open={drawerOpen}
          onClose={closeDrawer}
          side="right"
          size="lg"
          scrollResetKey={drawer?.kind === 'event' ? `${drawer.eventId}:${drawer.tab}` : drawer?.kind}
          eyebrow={
            isCreateDrawer
              ? 'Cadastro de evento'
              : isTeamDrawer
                ? 'Portaria do organizador'
                : 'Gestão do evento'
          }
          title={
            isCreateDrawer
              ? 'Novo evento'
              : isTeamDrawer
                ? 'Minha equipe padrão'
                : (drawerEvent?.title ?? 'Evento')
          }
          subtitle={
            isTeamDrawer
              ? 'Gerencie os integrantes fixos de check-in e crie contas STAFF diretamente.'
              : drawerEvent
                ? `${drawerEvent.location} · ${formatDate.format(new Date(drawerEvent.startsAt))}`
                : undefined
          }
          headerExtra={drawerEvent && drawer?.kind === 'event' ? (
            <div className="drawer-header-tools">
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

              {panel.status === 'ready' && canAccessPanel(panel.user.role) && drawerEvent.status === 'PUBLISHED' && (
                <button
                  type="button"
                  className={drawerEvent.featured ? 'btn btn-featured-active btn-sm' : 'btn btn-ghost btn-sm'}
                  aria-label={drawerEvent.featured ? `Remover destaque de ${drawerEvent.title}` : `Destacar ${drawerEvent.title}`}
                  aria-pressed={Boolean(drawerEvent.featured)}
                  disabled={togglingFeaturedId === drawerEvent.id}
                  onClick={() => void toggleFeatured(drawerEvent)}
                >
                  <StarIcon width={14} height={14} variant={drawerEvent.featured ? 'gradient' : 'current'} />
                  {drawerEvent.featured ? 'Em destaque' : 'Destacar'}
                </button>
              )}
            </div>
          ) : undefined}
        >
          {isCreateDrawer ? (
            <EventForm
              key="new"
              token={token}
              defaultTeamCount={isOrganizer ? defaultStaffCount : 0}
              onSaved={savePanelEvent}
              onSessionExpired={logout}
            />
          ) : isTeamDrawer ? (
            <OrganizerTeamPanel
              key="organizer-team"
              token={token}
              onSessionExpired={logout}
              onCountChange={setDefaultStaffCount}
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
                  key={`lots-${drawerEvent.id}-${drawer.autoCreateLot ? 'auto' : 'view'}`}
                  eventId={drawerEvent.id}
                  eventTitle={drawerEvent.title}
                  token={token}
                  onClose={closeDrawer}
                  onSessionExpired={logout}
                  embedded
                  autoOpenCreate={drawer.autoCreateLot}
                  initialNotice={drawer.lotGuidance}
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
                  onStaffCountChange={(count) => updateEventStaffCount(drawerEvent.id, count)}
                  onDefaultTeamCountChange={setDefaultStaffCount}
                  onOpenDefaultTeam={openTeamDrawer}
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
