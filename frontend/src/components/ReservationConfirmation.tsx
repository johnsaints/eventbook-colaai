import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { sessionTokenKey } from '../api'
import { formatPrice, payReservation, priceInCents, type CheckoutResult, type Reservation } from '../orders'

type PaymentState = CheckoutResult | { kind: 'idle' | 'submitting' }

const paymentMessages: Record<PaymentState['kind'], string> = {
  idle: 'Ingressos reservados.',
  retry: 'Ingressos reservados.',
  submitting: 'Processando pagamento simulado…',
  paid: 'Pagamento simulado aprovado.',
  expired: 'Sua reserva expirou.',
  cancelled: 'Este pedido foi cancelado.',
  login: 'Sua sessão expirou. Entre novamente para consultar o pedido.',
  unavailable: 'Não foi possível consultar esta reserva com a conta atual.',
}

function secondsRemaining(expiresAt: string) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000))
}

export default function ReservationConfirmation({
  order,
  lotNames,
}: {
  order: Reservation
  lotNames: Record<string, string>
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [seconds, setSeconds] = useState(() => secondsRemaining(order.expiresAt))
  const [payment, setPayment] = useState<PaymentState>({ kind: 'idle' })

  const awaitingPayment = payment.kind === 'idle' || payment.kind === 'retry'
  const status = awaitingPayment && seconds === 0 ? 'expired' : payment.kind
  const busy = status === 'submitting'
  const showAction = status === 'idle' || status === 'retry' || busy
  const paid = payment.kind === 'paid' ? payment : null
  const confirmed = paid !== null

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    headingRef.current?.focus()
  }, [confirmed])

  useEffect(() => {
    if (status === 'retry') actionRef.current?.focus()
  }, [status])

  useEffect(() => {
    if (!showAction) return
    const timer = window.setInterval(() => {
      const next = secondsRemaining(order.expiresAt)
      setSeconds(next)
      if (next === 0) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [order.expiresAt, showAction])

  async function submitPayment() {
    if (!awaitingPayment || requestRef.current) return
    if (secondsRemaining(order.expiresAt) === 0) {
      setSeconds(0)
      return
    }

    const token = sessionStorage.getItem(sessionTokenKey)
    if (!token) {
      setPayment({ kind: 'login' })
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setPayment({ kind: 'submitting' })
    try {
      const result = await payReservation(order, token, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'login' && sessionStorage.getItem(sessionTokenKey) === token) {
        sessionStorage.removeItem(sessionTokenKey)
      }
      setPayment(result)
    } catch {
      if (!controller.signal.aborted) {
        setPayment({ kind: 'retry', message: 'Não foi possível conectar à API. Tente novamente.' })
      }
    } finally {
      requestRef.current = null
    }
  }

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const remainder = String(seconds % 60).padStart(2, '0')

  return (
    <section className="event-card ticket-cart" aria-labelledby="reservation-title">
      <h2 id="reservation-title" ref={headingRef} tabIndex={-1}>
        {paid ? 'Pagamento confirmado' : 'Reserva de ingressos'}
      </h2>
      <p role="status">{paymentMessages[status]}</p>
      {showAction && seconds > 0 && (
        <p>Tempo restante <strong role="timer" aria-label="Tempo restante para a reserva">{minutes}:{remainder}</strong></p>
      )}
      <p>Pedido <strong>{order.id}</strong></p>
      <ul className="ticket-cart-items">
        {order.items.map(item => (
          <li key={item.lotId}>
            <span>{item.quantity} × {lotNames[item.lotId]}</span>
            <span>{formatPrice(priceInCents(item.unitPriceSnapshot) * BigInt(item.quantity))}</span>
          </li>
        ))}
      </ul>
      <p className="ticket-selection-total">
        {paid ? 'Total pago' : 'Total da reserva'}{' '}
        <strong>{formatPrice(priceInCents(paid?.totalAmount ?? order.totalAmount))}</strong>
      </p>
      {paid && (
        <>
          <p>{paid.ticketCount === 1 ? '1 ingresso emitido.' : paid.ticketCount + ' ingressos emitidos.'}</p>
          <p><Link to="/meus-ingressos">Ver meus ingressos</Link></p>
        </>
      )}
      {status === 'retry' && payment.kind === 'retry' && <p role="alert">{payment.message}</p>}
      {status === 'login' && <Link to="/login">Entrar novamente</Link>}
      {showAction && (
        <button
          className="ticket-cart-action"
          ref={actionRef}
          type="button"
          disabled={busy}
          onClick={() => void submitPayment()}
        >
          {busy ? 'Processando…' : status === 'retry' ? 'Tentar novamente' : 'Simular pagamento'}
        </button>
      )}
    </section>
  )
}
