import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatDate, getEventCategoryVisual, resolveEventCoverSrc, type EventSummary } from '../events'
import { ArrowLeftIcon, ArrowRightIcon, CalendarIcon, PinIcon, TicketIcon, UsersIcon } from './Icons'

const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const dayNum = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' })
const countFormat = new Intl.NumberFormat('pt-BR')

type SymplaHeroCarouselProps = {
  events: EventSummary[]
}

const SLIDE_INTERVAL_MS = 5500

export default function SymplaHeroCarousel({ events }: SymplaHeroCarouselProps) {
  const slides = events.slice(0, 8)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const count = slides.length
  const activeIndex = count > 0 ? index % count : 0

  useEffect(() => {
    if (count <= 1 || paused) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, SLIDE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [count, paused])

  if (count === 0) return null

  function goPrev() {
    setIndex((current) => (current - 1 + count) % count)
  }

  function goNext() {
    setIndex((current) => (current + 1) % count)
  }

  return (
    <section
      className={`sympla-hero${paused ? ' is-paused' : ''}`}
      aria-roledescription="carrossel"
      aria-label="Eventos em destaque no ColaAí"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false)
        }
      }}
    >
      <div className="sympla-hero-viewport">
        <div
          className="sympla-hero-track"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {slides.map((ev, slideIdx) => {
            const cat = getEventCategoryVisual(ev)
            const coverSrc = resolveEventCoverSrc(ev)
            const startsAt = new Date(ev.startsAt)
            const day = dayNum.format(startsAt)
            const month = monthShort.format(startsAt).replace('.', '').toUpperCase()

            return (
              <article
                key={ev.id}
                className="sympla-hero-slide"
                aria-hidden={slideIdx !== activeIndex}
              >
                <div className={`sympla-slide-visual ${cat.tone}`}>
                  <img src={coverSrc} alt="" className="sympla-slide-bg-img" />
                  <div className="sympla-slide-scrim" aria-hidden="true" />
                  <div className="sympla-visual-top">
                    <span className="ca-badge">
                      <span className="ca-badge-bar" aria-hidden="true" />
                      <span>{ev.highlightTag ?? 'Destaque'} · {cat.label}</span>
                    </span>
                    <div className="ca-date-stamp sympla-visual-date" aria-hidden="true">
                      <span className="date-day">{day}</span>
                      <span className="date-month">{month}</span>
                    </div>
                  </div>
                </div>

                <div className="sympla-slide-content">
                  <div className="sympla-slide-kicker">
                    <span className="eyebrow">Em cartaz no ColaAí</span>
                    {count > 1 && (
                      <span className="slide-counter">{slideIdx + 1} / {count}</span>
                    )}
                  </div>

                  <h2>
                    <Link
                      to={`/events/${ev.id}`}
                      tabIndex={slideIdx === activeIndex ? undefined : -1}
                    >
                      {ev.title}
                    </Link>
                  </h2>

                  <p className="sympla-slide-desc">{ev.description}</p>

                  <div className="sympla-slide-meta">
                    <p className="meta-row">
                      <CalendarIcon variant="gradient" className="meta-icon" />
                      <time dateTime={ev.startsAt}>{formatDate.format(startsAt)}</time>
                    </p>
                    <p className="meta-row">
                      <PinIcon variant="gradient" className="meta-icon" />
                      <span>{ev.location}</span>
                    </p>
                    {typeof ev.capacity === 'number' && ev.capacity > 0 && (
                      <p className="meta-row">
                        <UsersIcon variant="gradient" className="meta-icon" />
                        <span>Capacidade para {countFormat.format(ev.capacity)} pessoas</span>
                      </p>
                    )}
                  </div>

                  <div className="sympla-slide-cta">
                    <Link
                      to={`/events/${ev.id}`}
                      className="btn btn-primary"
                      tabIndex={slideIdx === activeIndex ? undefined : -1}
                    >
                      <TicketIcon />
                      Garantir ingresso
                      <ArrowRightIcon />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              className="sympla-nav-btn sympla-nav-prev"
              onClick={goPrev}
              aria-label="Destaque anterior"
            >
              <ArrowLeftIcon width={20} height={20} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="sympla-nav-btn sympla-nav-next"
              onClick={goNext}
              aria-label="Próximo destaque"
            >
              <ArrowRightIcon width={20} height={20} strokeWidth={2.4} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="sympla-hero-dots" role="tablist" aria-label="Selecionar destaque">
          {slides.map((ev, dotIdx) => (
            <button
              key={ev.id}
              type="button"
              role="tab"
              aria-selected={dotIdx === activeIndex}
              aria-label={`Destaque ${dotIdx + 1}: ${ev.title}`}
              className={dotIdx === activeIndex ? 'sympla-dot active' : 'sympla-dot'}
              onClick={() => setIndex(dotIdx)}
            >
              {dotIdx === activeIndex && <span className="sympla-dot-progress" />}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
