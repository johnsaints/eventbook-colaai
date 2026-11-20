import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  canAccessBuyerTickets,
  getStoredSessionUser,
  notifyUserUpdated,
  ROLE_LABELS,
  sessionTokenKey,
  userUpdatedEventName,
  type AuthUser,
} from '../api'
import { getEvent, type EventDetails } from '../events'
import { formatPrice, priceInCents, reserveTickets, type Reservation, type ReservationDraft, type ReservationItem } from '../orders'
import ReservationConfirmation from './ReservationConfirmation'
import './TicketSelection.css'

function availableQuantity(lot: EventDetails['lots'][number]) {
  return Math.max(0, lot.totalQuantity - lot.soldQuantity - lot.reservedQty)
}

export default function TicketSelection({ event, initialItems }: {
  event: EventDetails
  initialItems: ReservationItem[]
}) {
  const [lots, setLots] = useState(event.lots)
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialItems
      .filter(item => item && typeof item.lotId === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0)
      .map(item => [item.lotId, item.quantity]))
  )
  const [hasSession, setHasSession] = useState(() => Boolean(sessionStorage.getItem(sessionTokenKey)))
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(() => getStoredSessionUser())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reservation, setReservation] = useState<{ order: Reservation; lotNames: Record<string, string> } | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    function handleUserUpdated(event: Event) {
      const updated = (event as CustomEvent<AuthUser | null>).detail
      setSessionUser(updated)
      setHasSession(Boolean(sessionStorage.getItem(sessionTokenKey)))
    }

    window.addEventListener(userUpdatedEventName, handleUserUpdated)
    return () => window.removeEventListener(userUpdatedEventName, handleUserUpdated)
  }, [])

  const selection = lots.map(lot => {
    const available = availableQuantity(lot)
    const quantity = Math.min(available, quantities[lot.id] ?? 0)
    return { lot, available, quantity }
  })
  const selected = selection
    .filter(({ quantity }) => quantity > 0)
    .map(({ lot, quantity }) => ({ lot, quantity, subtotal: priceInCents(lot.price) * BigInt(quantity) }))
  const total = selected.reduce((sum, item) => sum + item.subtotal, 0n)
  const draft: ReservationDraft = {
    eventId: event.id,
    items: selected.map(({ lot, quantity }) => ({ lotId: lot.id, quantity })),
  }

  function changeQuantity(lotId: string, available: number, delta: number) {
    if (requestRef.current) return
    setQuantities(current => {
      const quantity = Math.min(available, current[lotId] ?? 0)
      const next = Math.max(0, Math.min(available, quantity + delta))
      return next === quantity ? current : { ...current, [lotId]: next }
    })
  }

  async function submit() {
    if (draft.items.length === 0 || requestRef.current || reservation) return
    const token = sessionStorage.getItem(sessionTokenKey)
    if (!token) {
      setHasSession(false)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setError('')

    try {
      const result = await reserveTickets(draft, token, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'reserved') {
        const lotNames = Object.fromEntries(selected.map(({ lot }) => [lot.id, lot.name]))
        setReservation({ order: result.order, lotNames })
      } else if (result.kind === 'login') {
        if (sessionStorage.getItem(sessionTokenKey) === token) {
          sessionStorage.removeItem(sessionTokenKey)
          notifyUserUpdated(null)
        }
        setHasSession(false)
        setError('Sua sessão expirou. Entre novamente para reservar.')
      } else {
        setError(result.message)
        if (result.kind === 'buyer') setHasSession(false)
        if (result.kind === 'availability') {
          try {
            const refreshed = await getEvent(event.id, controller.signal)
            if (controller.signal.aborted) return
            const currentLots = refreshed?.lots ?? []
            setLots(currentLots)
            setQuantities(current => Object.fromEntries(
              currentLots.map(lot => [lot.id, Math.min(availableQuantity(lot), current[lot.id] ?? 0)])
            ))
          } catch {
            if (!controller.signal.aborted) {
              setError(result.message + ' Não foi possível atualizar os lotes. Recarregue a página.')
            }
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setError('A API não confirmou a reserva. Verifique sua conexão e tente novamente.')
      }
    } finally {
      requestRef.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  if (reservation) return <ReservationConfirmation order={reservation.order} lotNames={reservation.lotNames} />

  return (
    <section aria-labelledby="lots-title" className="ticket-checkout-layout">
      <div className="ticket-lots-column">
        <h2 id="lots-title">Lotes à venda</h2>
        {selection.length === 0 ? (
          <div className="state-banner">
            <p>Nenhum lote à venda no momento.</p>
          </div>
        ) : (
          <ul className="lot-stack">
            {selection.map(({ lot, available, quantity }) => (
              <li key={lot.id}>
                <article className="event-card lot-row-card">
                  <div className="lot-row-info">
                    <div className="lot-row-header">
                      <h3>{lot.name}</h3>
                      <span className={available > 0 ? 'status-pill status-valid' : 'status-pill status-cancelled'}>
                        {available > 0 ? 'Disponível' : 'Esgotado'}
                      </span>
                    </div>
                    <p className="lot-price">{formatPrice(priceInCents(lot.price))}</p>
                    <p className="event-meta">
                      {available > 0 ? 'Ingressos disponíveis: ' + available : 'Lote esgotado'}
                    </p>
                  </div>

                  <div className="ticket-stepper" role="group" aria-label={'Seleção de ' + lot.name}>
                    <button
                      type="button"
                      aria-label={'Remover ingresso de ' + lot.name}
                      aria-disabled={busy || quantity === 0}
                      onClick={() => changeQuantity(lot.id, available, -1)}
                    >
                      −
                    </button>
                    <output aria-label={'Quantidade de ' + lot.name}>{quantity}</output>
                    <button
                      type="button"
                      aria-label={'Adicionar ingresso de ' + lot.name}
                      aria-disabled={busy || quantity >= available}
                      onClick={() => changeQuantity(lot.id, available, 1)}
                    >
                      +
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="ticket-cart-column">
        <section className="event-card ticket-cart ticket-cart-sticky" aria-labelledby="cart-title">
          <h2 id="cart-title">Resumo do carrinho</h2>
          {selected.length === 0 ? (
            <p className="event-meta">Selecione ingressos para montar sua reserva.</p>
          ) : (
            <>
              <ul className="ticket-cart-items">
                {selected.map(({ lot, quantity, subtotal }) => (
                  <li key={lot.id}>
                    <span>{quantity} × {lot.name}</span>
                    <span>{formatPrice(subtotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="ticket-selection-total">
                Total estimado <strong>{formatPrice(total)}</strong>
              </p>
            </>
          )}
          {error && <p className="form-alert" role="alert">{error}</p>}
          {selected.length > 0 && (
            !hasSession ? (
              <Link
                to="/login"
                state={{ reservationDraft: draft }}
                className="btn btn-primary btn-full"
              >
                Entrar para reservar
              </Link>
            ) : sessionUser && !canAccessBuyerTickets(sessionUser.role) ? (
              <>
                <p className="form-alert" role="alert">
                  Sua conta está no perfil {ROLE_LABELS[sessionUser.role]}. A reserva e compra de ingressos está disponível apenas para contas de Comprador (ou Admin).
                </p>
                <Link
                  to="/login"
                  state={{ reservationDraft: draft }}
                  className="btn btn-secondary btn-full"
                >
                  Trocar para conta de comprador
                </Link>
              </>
            ) : (
              <button className="ticket-cart-action btn-full" type="button" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Confirmando reserva…' : 'Reservar ingressos'}
              </button>
            )
          )}
        </section>
      </aside>
    </section>
  )
}
