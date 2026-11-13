import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createEvent, toLocalInput, updateEvent, type CreateEventInput, type EditableEvent, type OrganizerEvent } from '../events'

type Props = {
  token: string
  initialEvent?: EditableEvent
  onSaved: (event: OrganizerEvent) => void
  onSessionExpired: () => void
}

type Submission =
  | { status: 'idle' | 'submitting' }
  | { status: 'error' | 'saved'; message: string }

export default function EventForm({ token, initialEvent, onSaved, onSessionExpired }: Props) {
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' })
  const requestRef = useRef<AbortController | null>(null)
  const initialStart = initialEvent ? toLocalInput(initialEvent.startsAt) : ''
  const initialEnd = initialEvent ? toLocalInput(initialEvent.endsAt) : ''

  useEffect(() => () => requestRef.current?.abort(), [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const title = String(fields.get('title') ?? '')
    const description = String(fields.get('description') ?? '')
    const location = String(fields.get('location') ?? '')
    const capacity = Number(fields.get('capacity'))
    const startValue = String(fields.get('startsAt') ?? '')
    const endValue = String(fields.get('endsAt') ?? '')
    const startsAt = new Date(initialEvent && startValue === initialStart ? initialEvent.startsAt : startValue)
    const endsAt = new Date(initialEvent && endValue === initialEnd ? initialEvent.endsAt : endValue)

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setSubmission({ status: 'error', message: 'O término deve ser posterior ao início.' })
      return
    }

    const input: CreateEventInput = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      capacity,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    }

    const changes: Partial<CreateEventInput> = {}
    if (initialEvent) {
      if (title !== initialEvent.title) changes.title = input.title
      if (description !== initialEvent.description) changes.description = input.description
      if (location !== initialEvent.location) changes.location = input.location
      if (capacity !== initialEvent.capacity) changes.capacity = capacity
      if (startValue !== initialStart) changes.startsAt = input.startsAt
      if (endValue !== initialEnd) changes.endsAt = input.endsAt

      if (Object.keys(changes).length === 0) {
        setSubmission({ status: 'saved', message: 'Nenhuma alteração para salvar.' })
        return
      }
    }

    const controller = new AbortController()
    requestRef.current = controller
    setSubmission({ status: 'submitting' })

    try {
      const saved = initialEvent
        ? await updateEvent(initialEvent.id, changes, token, controller.signal)
        : await createEvent(input, token, controller.signal)

      if (controller.signal.aborted) return
      if (!saved) {
        onSessionExpired()
        return
      }

      onSaved(saved)
      if (!initialEvent) {
        form.reset()
        setSubmission({ status: 'saved', message: 'Evento criado como rascunho.' })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSubmission({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível salvar o evento.',
        })
      }
    } finally {
      requestRef.current = null
    }
  }

  return (
    <form className="event-card auth-form" onSubmit={handleSubmit}>
      <label>
        Título
        <input name="title" defaultValue={initialEvent?.title} minLength={3} maxLength={191} required />
      </label>
      <label>
        Descrição
        <textarea name="description" defaultValue={initialEvent?.description} minLength={10} rows={4} required />
      </label>
      <label>
        Local
        <input name="location" defaultValue={initialEvent?.location} minLength={3} maxLength={191} required />
      </label>
      <label>
        Capacidade
        <input name="capacity" defaultValue={initialEvent?.capacity} type="number" min={1} max={2147483647} step={1} required />
      </label>
      <p className="event-meta">Os horários seguem o fuso do seu navegador.</p>
      <label>
        Início
        <input name="startsAt" defaultValue={initialStart} type="datetime-local" required />
      </label>
      <label>
        Término
        <input name="endsAt" defaultValue={initialEnd} type="datetime-local" required />
      </label>
      {submission.status === 'error' && <p role="alert">{submission.message}</p>}
      {submission.status === 'saved' && <p role="status">{submission.message}</p>}
      <button type="submit" disabled={submission.status === 'submitting'}>
        {submission.status === 'submitting' ? 'Salvando…' : initialEvent ? 'Salvar alterações' : 'Criar evento'}
      </button>
    </form>
  )
}
