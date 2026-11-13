import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toLocalInput } from '../events'
import { createLot, updateLot, type LotInput, type ManagedLot } from '../lots'

type Props = {
  eventId: string
  token: string
  initialLot?: ManagedLot
  onSaved: () => void
  onCancel: () => void
  onSessionExpired: () => void
}

type Submission =
  | { status: 'idle' | 'submitting' }
  | { status: 'error' | 'no-change'; message: string }

export default function LotForm({ eventId, token, initialLot, onSaved, onCancel, onSessionExpired }: Props) {
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' })
  const requestRef = useRef<AbortController | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const initialStart = initialLot ? toLocalInput(initialLot.salesStartAt) : ''
  const initialEnd = initialLot ? toLocalInput(initialLot.salesEndAt) : ''

  useEffect(() => {
    nameRef.current?.focus()
    return () => requestRef.current?.abort()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return

    const fields = new FormData(event.currentTarget)
    const name = String(fields.get('name') ?? '')
    const price = Number(fields.get('price'))
    const quantity = Number(fields.get('quantity'))
    const startValue = String(fields.get('salesStartAt') ?? '')
    const endValue = String(fields.get('salesEndAt') ?? '')
    const start = new Date(initialLot && startValue === initialStart ? initialLot.salesStartAt : startValue)
    const end = new Date(initialLot && endValue === initialEnd ? initialLot.salesEndAt : endValue)
    const active = fields.has('active')

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setSubmission({ status: 'error', message: 'O fim das vendas deve ser posterior ao início.' })
      return
    }

    const input: LotInput = {
      name: name.trim(),
      price,
      quantity,
      salesStartAt: start.toISOString(),
      salesEndAt: end.toISOString(),
      active,
    }

    const changes: Partial<LotInput> = {}
    if (initialLot) {
      if (name !== initialLot.name) changes.name = input.name
      if (price !== Number(initialLot.price)) changes.price = price
      if (quantity !== initialLot.quantity) changes.quantity = quantity
      if (startValue !== initialStart) changes.salesStartAt = input.salesStartAt
      if (endValue !== initialEnd) changes.salesEndAt = input.salesEndAt
      if (active !== initialLot.active) changes.active = active

      if (Object.keys(changes).length === 0) {
        setSubmission({ status: 'no-change', message: 'Nenhuma alteração para salvar.' })
        return
      }
    }

    const controller = new AbortController()
    requestRef.current = controller
    setSubmission({ status: 'submitting' })

    try {
      const saved = initialLot
        ? await updateLot(eventId, initialLot.id, changes, token, controller.signal)
        : await createLot(eventId, input, token, controller.signal)

      if (controller.signal.aborted) return
      if (!saved) {
        onSessionExpired()
        return
      }

      onSaved()
    } catch (error) {
      if (!controller.signal.aborted) {
        setSubmission({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível salvar o lote.',
        })
      }
    } finally {
      requestRef.current = null
    }
  }

  return (
    <form className="event-card auth-form" onSubmit={handleSubmit}>
      <label>
        Nome do lote
        <input ref={nameRef} name="name" defaultValue={initialLot?.name} minLength={3} maxLength={191} required />
      </label>
      <label>
        Preço (R$)
        <input name="price" defaultValue={initialLot?.price} type="number" min={0} max={99999999.99} step={0.01} required />
      </label>
      <label>
        Quantidade de ingressos
        <input name="quantity" defaultValue={initialLot?.quantity} type="number" min={1} max={2147483647} step={1} required />
      </label>
      <p className="event-meta">Os horários seguem o fuso do seu navegador.</p>
      <label>
        Início das vendas
        <input name="salesStartAt" defaultValue={initialStart} type="datetime-local" required />
      </label>
      <label>
        Fim das vendas
        <input name="salesEndAt" defaultValue={initialEnd} type="datetime-local" required />
      </label>
      <label className="checkbox-field">
        <input name="active" type="checkbox" defaultChecked={initialLot?.active ?? true} />
        Lote ativo
      </label>
      {submission.status === 'error' && <p role="alert">{submission.message}</p>}
      {submission.status === 'no-change' && <p role="status">{submission.message}</p>}
      <div className="event-actions">
        <button type="submit" disabled={submission.status === 'submitting'}>
          {submission.status === 'submitting' ? 'Salvando…' : initialLot ? 'Salvar alterações' : 'Cadastrar lote'}
        </button>
        <button type="button" disabled={submission.status === 'submitting'} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}
