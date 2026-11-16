import { useRef } from 'react'
import { Link } from 'react-router'
import { formatDate, getEventCategoryVisual, resolveEventCoverSrc, type EventSummary } from '../events'
import { ArrowLeftIcon, ArrowRightIcon, CalendarIcon, PinIcon, TicketIcon } from './Icons'

type SymplaShelfCarouselProps = {
  events: EventSummary[]
}

const dayNum = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' })
const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

export default function SymplaShelfCarousel({ events }: SymplaShelfCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null)

  if (events.length === 0) return null

  function scrollShelf(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * 340, behavior: 'smooth' })
  }

  return (
    <section className="sympla-shelf-section" aria-labelledby="trending-title">
      <div className="section-header">
        <div>
          <h2 id="trending-title">Em alta no ColaAí</h2>
          <p className="section-subtitle">Os próximos eventos mais procurados da programação</p>
        </div>

        {events.length > 2 && (
          <div className="sympla-shelf-controls">
            <button
              type="button"
              className="shelf-arrow-btn"
              onClick={() => scrollShelf(-1)}
              aria-label="Rolar carrossel para a esquerda"
            >
              <ArrowLeftIcon width={18} height={18} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="shelf-arrow-btn"
              onClick={() => scrollShelf(1)}
              aria-label="Rolar carrossel para a direita"
            >
              <ArrowRightIcon width={18} height={18} strokeWidth={2.4} />
            </button>
          </div>
        )}
      </div>

      <ul className="sympla-shelf-track" ref={trackRef}>
        {events.map((ev) => {
          const cat = getEventCategoryVisual(ev)
          const coverSrc = resolveEventCoverSrc(ev)
          const startsAt = new Date(ev.startsAt)
          const day = dayNum.format(startsAt)
          const month = monthShort.format(startsAt).replace('.', '').toUpperCase()

          return (
            <li key={ev.id} className="sympla-shelf-item">
              <article className="event-card catalog-card">
                <div className={`card-cover ${cat.tone}`}>
                  <img src={coverSrc} alt="" className="card-cover-img" loading="lazy" />
                  <span className="category-badge">{cat.label}</span>
                  <div className="date-badge" aria-hidden="true">
                    <span className="date-day">{day}</span>
                    <span className="date-month">{month}</span>
                  </div>
                </div>

                <div className="card-body">
                  <p className="sympla-card-date">
                    <CalendarIcon width={14} height={14} aria-hidden="true" />
                    <time dateTime={ev.startsAt}>{formatDate.format(startsAt)}</time>
                  </p>
                  <h3>
                    <Link to={`/events/${ev.id}`}>{ev.title}</Link>
                  </h3>
                  <p className="event-meta meta-row sympla-card-location">
                    <PinIcon className="meta-icon" />
                    <span>{ev.location}</span>
                  </p>

                  <div className="card-footer">
                    <Link to={`/events/${ev.id}`} className="btn btn-secondary btn-sm btn-full">
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
    </section>
  )
}
