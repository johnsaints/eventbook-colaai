import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  createEvent,
  getEventCategoryVisual,
  prepareCoverUpload,
  toLocalInput,
  updateEvent,
  type CreateEventInput,
  type EditableEvent,
  type OrganizerEvent,
} from '../events'
import { CloseIcon, ImageIcon, UploadIcon } from './Icons'

type Props = {
  token: string
  initialEvent?: EditableEvent
  defaultTeamCount?: number
  onSaved: (event: OrganizerEvent) => void
  onSessionExpired: () => void
}

type Submission =
  | { status: 'idle' | 'submitting' }
  | { status: 'error' | 'saved'; message: string }

export default function EventForm({ token, initialEvent, defaultTeamCount = 0, onSaved, onSessionExpired }: Props) {
  const [submission, setSubmission] = useState<Submission>({ status: 'idle' })
  const [titlePreview, setTitlePreview] = useState(() => initialEvent?.title ?? '')
  const [descPreview, setDescPreview] = useState(() => initialEvent?.description ?? '')
  const [coverImage, setCoverImage] = useState<string | null>(() => initialEvent?.coverImage ?? null)
  const [attachDefaultTeam, setAttachDefaultTeam] = useState(true)
  const [coverError, setCoverError] = useState('')
  const [processingCover, setProcessingCover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const initialStart = initialEvent ? toLocalInput(initialEvent.startsAt) : ''
  const initialEnd = initialEvent ? toLocalInput(initialEvent.endsAt) : ''

  useEffect(() => () => requestRef.current?.abort(), [])

  const categoryPreview = getEventCategoryVisual({
    title: titlePreview,
    description: descPreview,
  })
  const previewSrc = coverImage || categoryPreview.coverSrc

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setCoverError('')
    setProcessingCover(true)
    try {
      const encoded = await prepareCoverUpload(file)
      setCoverImage(encoded)
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : 'Não foi possível carregar a imagem.')
    } finally {
      setProcessingCover(false)
    }
  }

  function handleClearCover() {
    setCoverImage(null)
    setCoverError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current || processingCover) return

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
      coverImage,
      ...(!initialEvent ? { attachDefaultTeam: defaultTeamCount > 0 ? attachDefaultTeam : false } : {}),
    }

    const changes: Partial<CreateEventInput> = {}
    if (initialEvent) {
      if (title !== initialEvent.title) changes.title = input.title
      if (description !== initialEvent.description) changes.description = input.description
      if (location !== initialEvent.location) changes.location = input.location
      if (capacity !== initialEvent.capacity) changes.capacity = capacity
      if (startValue !== initialStart) changes.startsAt = input.startsAt
      if (endValue !== initialEnd) changes.endsAt = input.endsAt
      if (coverImage !== (initialEvent.coverImage ?? null)) changes.coverImage = coverImage

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
        setTitlePreview('')
        setDescPreview('')
        setCoverImage(null)
        setCoverError('')
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
        <input
          name="title"
          defaultValue={initialEvent?.title}
          onChange={(e) => setTitlePreview(e.target.value)}
          minLength={3}
          maxLength={191}
          required
        />
      </label>
      <label>
        Descrição
        <textarea
          name="description"
          defaultValue={initialEvent?.description}
          onChange={(e) => setDescPreview(e.target.value)}
          minLength={10}
          rows={4}
          required
        />
      </label>

      <div className="cover-upload-field">
        <span className="cover-field-title">Imagem de fundo na homepage (16:9)</span>
        <div className="cover-preview-box">
          <img src={previewSrc} alt="Prévia da capa do evento" className="cover-preview-img" />
          <div className="cover-preview-overlay">
            <span className="ca-badge">
              <span className="ca-badge-bar" aria-hidden="true" />
              <ImageIcon width={13} height={13} variant="gradient" />
              <span>{coverImage ? 'Imagem personalizada' : `Padrão · ${categoryPreview.label}`}</span>
            </span>
          </div>
        </div>
        <div className="cover-upload-actions">
          <label className="btn btn-secondary btn-sm cover-upload-trigger">
            <UploadIcon width={16} height={16} />
            {processingCover ? 'Processando imagem…' : coverImage ? 'Trocar imagem' : 'Enviar imagem personalizada'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleFileChange(e)}
              disabled={processingCover}
              className="sr-only-input"
            />
          </label>
          {coverImage && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearCover}>
              <CloseIcon width={15} height={15} />
              Usar padrão
            </button>
          )}
        </div>
        <p className="event-meta cover-upload-hint">
          Opcional (PNG, JPEG ou WebP). Se não enviar, o ColaAí usa o fundo padrão da categoria.
        </p>
        {coverError && <p role="alert" className="form-alert">{coverError}</p>}
      </div>

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
      {!initialEvent && defaultTeamCount > 0 && (
        <label className="remember-access-field">
          <input
            type="checkbox"
            checked={attachDefaultTeam}
            onChange={(event) => setAttachDefaultTeam(event.target.checked)}
          />
          <span className="remember-access-copy">
            <strong>Vincular automaticamente minha equipe padrão ({defaultTeamCount})</strong>
            <span>Os integrantes da sua portaria fixa já terão acesso a este evento no Check-in.</span>
          </span>
        </label>
      )}
      {submission.status === 'error' && <p role="alert">{submission.message}</p>}
      {submission.status === 'saved' && <p role="status">{submission.message}</p>}
      <button type="submit" className="btn btn-primary" disabled={submission.status === 'submitting' || processingCover}>
        {submission.status === 'submitting' ? 'Salvando…' : initialEvent ? 'Salvar alterações' : 'Criar evento'}
      </button>
    </form>
  )
}
