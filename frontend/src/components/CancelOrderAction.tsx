import { useEffect, useId, useRef, useState } from 'react'
import type { CancelOrderResult, HistoryOrder } from '../history'

const paidCancellationLeadTime = 12 * 60 * 60_000

function blockReason(order: HistoryOrder, now: number) {
  if (order.event.status === 'CANCELLED') return 'Este evento foi cancelado pelo organizador.'
  if (order.status === 'CANCELLED') return 'Este pedido já foi cancelado.'
  if (order.status === 'EXPIRED') return 'A reserva deste pedido expirou.'

  const paid = order.status === 'PAID'
  const deadline = paid
    ? Date.parse(order.event.startsAt) - paidCancellationLeadTime
    : Date.parse(order.expiresAt)

  if (!Number.isFinite(deadline)) return 'Não foi possível verificar o prazo de cancelamento.'
  if (paid && now > deadline) {
    return 'O prazo de cancelamento terminou 12 horas antes do início do evento.'
  }
  if (!paid && now >= deadline) return 'A reserva deste pedido expirou.'
  return ''
}

type Props = {
  order: HistoryOrder
  now: number
  cancellingId: string | null
  onCancel: (id: string) => Promise<CancelOrderResult | undefined>
}

export default function CancelOrderAction({ order, now, cancellingId, onCancel }: Props) {
  const reasonId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const [confirming, setConfirming] = useState(false)
  const [serverBlock, setServerBlock] = useState('')
  const [error, setError] = useState('')
  const reason = serverBlock || blockReason(order, now)
  const busy = cancellingId === order.id
  const canCancel = !reason && cancellingId === null
  const showConfirmation = confirming && (!reason || busy)

  useEffect(() => {
    if (showConfirmation) confirmRef.current?.focus()
    else if (wasOpen.current) triggerRef.current?.focus()
    wasOpen.current = showConfirmation
  }, [showConfirmation])

  function startConfirmation() {
    if (!canCancel || blockReason(order, Date.now())) return
    setConfirming(true)
    setError('')
  }

  async function confirm() {
    if (!canCancel || blockReason(order, Date.now())) return
    setError('')
    const result = await onCancel(order.id)
    if (result?.kind === 'blocked') {
      setServerBlock(result.message)
      setConfirming(false)
    } else if (result?.kind === 'retry') {
      setError(result.message)
      confirmRef.current?.focus()
    }
  }

  return (
    <div className="history-cancel">
      {showConfirmation ? (
        <div role="group" aria-label="Confirmação do cancelamento">
          <p>
            {order.status === 'PAID'
              ? 'Confirma o cancelamento? Os ingressos deste pedido serão invalidados.'
              : 'Confirma o cancelamento? A reserva deste pedido será liberada.'}
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="history-confirm-actions">
            <button
              className="history-action"
              ref={confirmRef}
              type="button"
              aria-disabled={!canCancel}
              onClick={() => void confirm()}
            >
              {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
            <button
              className="history-action"
              type="button"
              aria-disabled={busy}
              onClick={() => { if (!busy) setConfirming(false) }}
            >
              Manter pedido
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className="history-action"
            ref={triggerRef}
            type="button"
            aria-disabled={!canCancel}
            aria-describedby={reason ? reasonId : undefined}
            onClick={startConfirmation}
          >
            Cancelar pedido
          </button>
          {reason && <p id={reasonId} className="event-meta" role={serverBlock ? 'alert' : undefined}>{reason}</p>}
        </>
      )}
    </div>
  )
}
