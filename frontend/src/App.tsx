import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import {
  apiUrl,
  getStoredSessionUser,
  userUpdatedEventName,
  type AuthUser,
} from './api'
import AppLayout from './components/AppLayout'
import HeroAmbientBackdrop from './components/HeroAmbientBackdrop'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BrandGridIcon,
  CalendarIcon,
  CloseIcon,
  LaptopIcon,
  MusicIcon,
  PinIcon,
  SearchIcon,
  ShieldCheckIcon,
  StarIcon,
  TheaterIcon,
  TicketIcon,
  TrophyIcon,
  UtensilsIcon,
  type CaIconProps,
} from './components/Icons'
import { CatalogSkeleton } from './components/Skeletons'
import SymplaHeroCarousel from './components/SymplaHeroCarousel'
import ToastViewport from './components/ToastViewport'
import {
  formatDate,
  getEventCategoryVisual,
  getEventHighlights,
  resolveEventCoverSrc,
  type EventSort,
  type EventSummary,
} from './events'
import BuyerHistoryPage from './pages/BuyerHistoryPage'
import CheckinPage from './pages/CheckinPage'
import EventPage from './pages/EventPage'
import LoginPage from './pages/LoginPage'
import MagicLinkVerifyPage from './pages/MagicLinkVerifyPage'
import OrganizerPage from './pages/OrganizerPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'
import { scrollElementToTop, scrollWindowToTop } from './scroll'

type CatalogMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; events: EventSummary[]; meta: CatalogMeta }

type CategoryFilter = {
  id: string
  label: string
  query: string
  Icon: ComponentType<CaIconProps>
}

const CATEGORIES: CategoryFilter[] = [
  { id: 'all', label: 'Todos', query: '', Icon: BrandGridIcon },
  { id: 'show', label: 'Shows', query: 'Show', Icon: MusicIcon },
  { id: 'festival', label: 'Festivais', query: 'Festival', Icon: TicketIcon },
  { id: 'teatro', label: 'Teatro & Humor', query: 'Teatro', Icon: TheaterIcon },
  { id: 'futebol', label: 'Esportes', query: 'Futebol', Icon: TrophyIcon },
  { id: 'tech', label: 'Tecnologia', query: 'Tecnologia', Icon: LaptopIcon },
  { id: 'food', label: 'Gastronomia', query: 'Gastron', Icon: UtensilsIcon },
]

const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const dayNum = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' })

function CatalogPage() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [highlights, setHighlights] = useState<EventSummary[]>([])
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<EventSort>('soonest')
  const [searchInput, setSearchInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(() => getStoredSessionUser())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const catalogSectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    function handleUserUpdated(event: Event) {
      setSessionUser((event as CustomEvent<AuthUser | null>).detail)
    }

    window.addEventListener(userUpdatedEventName, handleUserUpdated)
    return () => window.removeEventListener(userUpdatedEventName, handleUserUpdated)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getEventHighlights(controller.signal, 8).then((items) => {
      if (!controller.signal.aborted) setHighlights(items)
    })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const controller = new AbortController()

    async function loadEvents() {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '9', sort })
        if (activeQuery.trim()) params.set('q', activeQuery.trim())

        const response = await fetch(`${apiUrl}/events?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Falha ao consultar eventos.')

        const body = (await response.json()) as { data: EventSummary[]; meta?: CatalogMeta }
        if (!Array.isArray(body.data)) throw new Error('Resposta inválida.')

        const meta: CatalogMeta = body.meta ?? {
          page,
          limit: 9,
          total: body.data.length,
          totalPages: 1,
        }

        if (!controller.signal.aborted) {
          setCatalog({ status: 'ready', events: body.data, meta })
        }
      } catch {
        if (!controller.signal.aborted) setCatalog({ status: 'error' })
      }
    }

    void loadEvents()
    return () => controller.abort()
  }, [attempt, page, activeQuery, sort])

  function retry() {
    headingRef.current?.focus()
    setCatalog({ status: 'loading' })
    setAttempt(current => current + 1)
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveCategory('all')
    setPage(1)
    setCatalog({ status: 'loading' })
    setActiveQuery(searchInput.trim())
  }

  function selectCategory(cat: CategoryFilter) {
    setActiveCategory(cat.id)
    setSearchInput(cat.query)
    setPage(1)
    setCatalog({ status: 'loading' })
    setActiveQuery(cat.query)
  }

  function clearFilters() {
    setActiveCategory('all')
    setSearchInput('')
    setPage(1)
    setCatalog({ status: 'loading' })
    setActiveQuery('')
  }

  function goToPage(nextPage: number) {
    setPage(nextPage)
    scrollElementToTop(catalogSectionRef.current)
  }

  const isFiltered = Boolean(activeQuery.trim())

  return (
    <AppLayout>
      <main className="catalog home-sympla">
        {!isFiltered && highlights.length > 0 && (
          <SymplaHeroCarousel events={highlights} />
        )}

        <section className="sympla-top-bar" aria-label="Busca e boas-vindas ColaAí">
          <HeroAmbientBackdrop />
          <div className="sympla-top-bar-content">
            <div className="sympla-top-intro">
              <span className="eyebrow">Ingressos e acessos digitais ColaAí</span>
              <h1>Descubra e garanta seu lugar nos melhores eventos</h1>
            </div>

            <form className="search-bar sympla-search-bar" onSubmit={handleSearchSubmit} role="search" aria-label="Buscar eventos">
              <div className="search-input-wrap">
                <SearchIcon className="search-icon" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Pesquisar eventos, shows, teatros, cidades…"
                  aria-label="Buscar por nome ou local do evento"
                />
                {searchInput && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={clearFilters}
                    aria-label="Limpar campo de busca"
                  >
                    <CloseIcon width={15} height={15} />
                  </button>
                )}
              </div>
              <button type="submit" className="btn btn-primary">Buscar</button>
            </form>
          </div>
        </section>

        <section className="sympla-categories" aria-label="Explorar por categoria">
          <div className="sympla-cat-strip" role="group" aria-label="Filtrar por categoria">
            {CATEGORIES.map((cat) => {
              const Icon = cat.Icon
              const active = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={active ? 'sympla-cat-btn is-active' : 'sympla-cat-btn'}
                  aria-pressed={active}
                  onClick={() => selectCategory(cat)}
                >
                  <span className="ca-cat-squircle" aria-hidden="true">
                    <Icon width={22} height={22} variant={active ? 'current' : 'gradient'} />
                  </span>
                  <span className="sympla-cat-label">{cat.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="events-section" ref={catalogSectionRef} aria-labelledby="events-title">
          <div className="section-header">
            <div className="ca-section-heading">
              <h2 id="events-title" tabIndex={-1} ref={headingRef}>
                {isFiltered ? `Resultados para “${activeQuery}”` : 'Todos os eventos'}
              </h2>
              {catalog.status === 'ready' && (
                <p className="section-subtitle">
                  {catalog.meta.total === 1
                    ? '1 evento publicado disponível agora'
                    : `${catalog.meta.total} eventos publicados disponíveis para reserva`}
                </p>
              )}
            </div>
            <div className="catalog-header-controls">
              <label className="catalog-sort-control">
                <span>Ordenar por</span>
                <select
                  aria-label="Ordenar eventos"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.currentTarget.value as EventSort)
                    setPage(1)
                    setCatalog({ status: 'loading' })
                  }}
                >
                  <option value="soonest">Mais próximos</option>
                  <option value="popular">Mais procurados</option>
                  <option value="largest">Maior porte</option>
                </select>
              </label>
              {isFiltered && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {catalog.status === 'loading' && <CatalogSkeleton />}

          {catalog.status === 'error' && (
            <div className="state-banner state-error">
              <p role="alert">Não foi possível carregar os eventos.</p>
              <button type="button" className="btn btn-secondary" onClick={retry}>Tentar novamente</button>
            </div>
          )}

          {catalog.status === 'ready' && (
            catalog.events.length === 0 ? (
              <div className="state-banner">
                <p>Nenhum evento publicado encontrado para este filtro.</p>
                {activeQuery && (
                  <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                    Ver todos os eventos
                  </button>
                )}
              </div>
            ) : (
              <>
                <ul className="event-list">
                  {catalog.events.map((event) => {
                    const cat = getEventCategoryVisual(event)
                    const coverSrc = resolveEventCoverSrc(event)
                    const date = new Date(event.startsAt)
                    const day = dayNum.format(date)
                    const month = monthShort.format(date).replace('.', '').toUpperCase()

                    return (
                      <li key={event.id}>
                        <article className="event-card catalog-card">
                          <div className={`card-cover ${cat.tone}`}>
                            <img src={coverSrc} alt="" className="card-cover-img" loading="lazy" />
                            <div className="card-cover-tags">
                              <span className="ca-badge">
                                <span className="ca-badge-bar" aria-hidden="true" />
                                <span>{cat.label}</span>
                              </span>
                              {event.featured && (
                                <span className="ca-featured-pill">
                                  <StarIcon width={12} height={12} />
                                  <span>Destaque</span>
                                </span>
                              )}
                            </div>
                            <div className="ca-date-stamp date-badge" aria-hidden="true">
                              <span className="date-day">{day}</span>
                              <span className="date-month">{month}</span>
                            </div>
                          </div>

                          <div className="card-body">
                            <p className="sympla-card-date">
                              <CalendarIcon width={14} height={14} aria-hidden="true" />
                              <time dateTime={event.startsAt}>
                                {formatDate.format(date)}
                              </time>
                            </p>

                            <h3>
                              <Link to={`/events/${event.id}`}>{event.title}</Link>
                            </h3>
                            <p className="card-description">{event.description}</p>

                            <div className="card-meta-list">
                              <p className="event-meta meta-row">
                                <PinIcon variant="gradient" className="meta-icon" />
                                <span>{event.location}</span>
                              </p>
                            </div>

                            <div className="card-footer">
                              <Link to={`/events/${event.id}`} className="btn btn-secondary btn-sm btn-full">
                                <TicketIcon />
                                Ver ingressos
                              </Link>
                            </div>
                          </div>
                        </article>
                      </li>
                    )
                  })}
                </ul>

                {catalog.meta.totalPages > 1 && (
                  <nav className="pagination" aria-label="Paginação de eventos">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page <= 1}
                      onClick={() => goToPage(Math.max(1, page - 1))}
                    >
                      <ArrowLeftIcon width={15} height={15} />
                      Anterior
                    </button>
                    <span className="pagination-info">
                      Página {catalog.meta.page} de {catalog.meta.totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page >= catalog.meta.totalPages}
                      onClick={() => goToPage(Math.min(catalog.meta.totalPages, page + 1))}
                    >
                      Próxima
                      <ArrowRightIcon width={15} height={15} />
                    </button>
                  </nav>
                )}
              </>
            )
          )}
        </section>

        {!sessionUser && (
          <section className="sympla-producer-banner" aria-label="Para organizadores de eventos">
            <div className="sympla-producer-copy">
              <span className="eyebrow">ColaAí Produtores</span>
              <h2>Organize e venda ingressos do seu evento com segurança</h2>
              <p className="event-meta">
                Publique eventos por lotes, acompanhe a ocupação em tempo real e controle o check-in digital da portaria.
              </p>
            </div>
            <Link to="/painel" className="btn btn-primary">
              <ShieldCheckIcon width={17} height={17} />
              Abrir painel do organizador
              <ArrowRightIcon />
            </Link>
          </section>
        )}
      </main>
    </AppLayout>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    scrollWindowToTop(false)
  }, [pathname])

  return null
}

function NotFoundPage() {
  return (
    <AppLayout>
      <main className="catalog">
        <div className="state-banner">
          <h1>Página não encontrada</h1>
          <p className="event-meta">Confira o endereço ou volte para a vitrine do ColaAí.</p>
          <Link to="/" className="btn btn-primary">Voltar aos eventos</Link>
        </div>
      </main>
    </AppLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastViewport />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/magic-link" element={<MagicLinkVerifyPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/check-in" element={<CheckinPage />} />
        <Route path="/painel" element={<OrganizerPage />} />
        <Route path="/meus-ingressos" element={<BuyerHistoryPage />} />
        <Route path="/events/:eventId" element={<EventPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
