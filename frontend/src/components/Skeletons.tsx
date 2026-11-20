export function CatalogSkeleton() {
  return (
    <div role="status" aria-label="Carregando eventos">
      <span className="sr-only-text">Carregando eventos…</span>
      <ul className="event-list" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <article className="event-card catalog-card ca-skeleton-card">
              <div className="ca-skeleton ca-skeleton-cover" />
              <div className="card-body">
                <div className="ca-skeleton ca-skeleton-line ca-skeleton-sm" />
                <div className="ca-skeleton ca-skeleton-line ca-skeleton-title" />
                <div className="ca-skeleton ca-skeleton-line" />
                <div className="ca-skeleton ca-skeleton-line ca-skeleton-short" />
                <div className="ca-skeleton ca-skeleton-btn" />
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TicketsSkeleton() {
  return (
    <div role="status" aria-label="Carregando ingressos">
      <span className="sr-only-text">Carregando ingressos…</span>
      <div className="ticket-list-stack" aria-hidden="true">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="ca-skeleton-ticket">
            <div className="ca-skeleton ca-skeleton-ticket-body" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="profile-grid" role="status" aria-label="Carregando perfil">
      <span className="sr-only-text">Carregando dados do perfil…</span>
      <div className="profile-card ca-skeleton-profile-side" aria-hidden="true">
        <div className="ca-skeleton ca-skeleton-avatar" />
        <div className="ca-skeleton ca-skeleton-line ca-skeleton-title" />
        <div className="ca-skeleton ca-skeleton-line ca-skeleton-short" />
      </div>
      <div className="profile-forms-stack" aria-hidden="true">
        <div className="profile-card ca-skeleton-profile-main">
          <div className="ca-skeleton ca-skeleton-line ca-skeleton-title" />
          <div className="ca-skeleton ca-skeleton-line" />
          <div className="ca-skeleton ca-skeleton-line ca-skeleton-short" />
        </div>
      </div>
    </div>
  )
}
