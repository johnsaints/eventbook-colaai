import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import symbolIcon from './assets/colaai-icon-128.png'
import { apiUrl } from './api'
import AppLayout from './components/AppLayout'
import { formatDate, type EventSummary } from './events'
import BuyerHistoryPage from './pages/BuyerHistoryPage'
import CheckinPage from './pages/CheckinPage'
import EventPage from './pages/EventPage'
import LoginPage from './pages/LoginPage'
import OrganizerPage from './pages/OrganizerPage'
import RegisterPage from './pages/RegisterPage'

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
}

const CATEGORIES: CategoryFilter[] = [
  { id: 'all', label: 'Todos', query: '' },
  { id: 'show', label: 'Shows', query: 'Show' },
  { id: 'festival', label: 'Festivais', query: 'Festival' },
  { id: 'teatro', label: 'Teatro', query: 'Teatro' },
  { id: 'futebol', label: 'Futebol', query: 'Futebol' },
  { id: 'tech', label: 'Tecnologia', query: 'Tecnologia' },
]

function inferCategory(event: EventSummary): { label: string; tone: string } {
  const text = `${event.title} ${event.description}`.toLowerCase()
  if (text.includes('festival')) return { label: 'Festival', tone: 'tone-festival' }
  if (text.includes('show') || text.includes('turnê') || text.includes('música')) return { label: 'Show', tone: 'tone-show' }
  if (text.includes('teatro') || text.includes('stand-up') || text.includes('comédia')) return { label: 'Teatro & Cultura', tone: 'tone-theater' }
  if (text.includes('futebol') || text.includes('clássico') || text.includes('estádio')) return { label: 'Esportes', tone: 'tone-sports' }
  if (text.includes('tecnologia') || text.includes('tech') || text.includes('dev')) return { label: 'Tecnologia', tone: 'tone-tech' }
  return { label: 'Evento', tone: 'tone-default' }
}

const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const dayNum = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' })

function CatalogPage() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadEvents() {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '9' })
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
  }, [attempt, page, activeQuery])

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

  return (
    <AppLayout>
      <main className="catalog">
        <section className="hero-banner" aria-label="Destaque ColaAí">
          <div className="hero-content">
            <span className="hero-pill">
              <img src={symbolIcon} alt="" className="hero-pill-icon" />
              Ingressos e acessos digitais
            </span>
            <h1>ColaAí nos melhores eventos</h1>
            <p className="hero-subtitle">
              Shows, festivais, teatro, futebol e encontros de tecnologia com reserva garantida e entrada ágil.
            </p>

            <form className="search-bar" onSubmit={handleSearchSubmit} role="search" aria-label="Buscar eventos">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por show, festival, teatro, local…"
                aria-label="Buscar por nome ou local do evento"
              />
              <button type="submit" className="btn btn-primary">Buscar</button>
            </form>

            <div className="category-pills" role="group" aria-label="Filtrar por categoria">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={activeCategory === cat.id ? 'chip chip-active' : 'chip'}
                  onClick={() => selectCategory(cat)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="events-section" aria-labelledby="events-title">
          <div className="section-header">
            <h2 id="events-title" tabIndex={-1} ref={headingRef}>Eventos publicados</h2>
            {activeQuery && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Limpar busca (“{activeQuery}”)
              </button>
            )}
          </div>

          {catalog.status === 'loading' && (
            <p className="state-banner" role="status">Carregando eventos…</p>
          )}

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
                    const cat = inferCategory(event)
                    const date = new Date(event.startsAt)
                    const day = dayNum.format(date)
                    const month = monthShort.format(date).replace('.', '').toUpperCase()

                    return (
                      <li key={event.id}>
                        <article className="event-card catalog-card">
                          <div className={`card-cover ${cat.tone}`}>
                            <span className="category-badge">{cat.label}</span>
                            <div className="date-badge" aria-hidden="true">
                              <span className="date-day">{day}</span>
                              <span className="date-month">{month}</span>
                            </div>
                          </div>

                          <div className="card-body">
                            <h3>
                              <Link to={`/events/${event.id}`}>{event.title}</Link>
                            </h3>
                            <p className="card-description">{event.description}</p>

                            <div className="card-meta-list">
                              <p className="event-meta">📍 {event.location}</p>
                              <p className="event-meta">
                                🗓️{' '}
                                <time dateTime={event.startsAt}>
                                  {formatDate.format(date)}
                                </time>
                              </p>
                            </div>

                            <div className="card-footer">
                              <Link to={`/events/${event.id}`} className="btn btn-secondary btn-sm">
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
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      ← Anterior
                    </button>
                    <span className="pagination-info">
                      Página {catalog.meta.page} de {catalog.meta.totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page >= catalog.meta.totalPages}
                      onClick={() => setPage(p => Math.min(catalog.meta.totalPages, p + 1))}
                    >
                      Próxima →
                    </button>
                  </nav>
                )}
              </>
            )
          )}
        </section>
      </main>
    </AppLayout>
  )
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
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/check-in" element={<CheckinPage />} />
        <Route path="/painel" element={<OrganizerPage />} />
        <Route path="/meus-ingressos" element={<BuyerHistoryPage />} />
        <Route path="/events/:eventId" element={<EventPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
