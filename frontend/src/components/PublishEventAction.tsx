import { useEffect, useRef, useState } from 'react'
import { publishEvent, type OrganizerEvent } from '../events'

type Props = {
  event: OrganizerEvent
  token: string
  onPublished: (eventId: string) => void
  onSessionExpired: () => void
}

type PublicationState =
  | { status: 'idle' | 'publishing' | 'published' }
  | { status: 'error'; message: string }

export default function PublishEventAction({ event, token, onPublished, onSessionExpired }: Props) {
  const [state, setState] = useState<PublicationState>({ status: 'idle' })
  const requestRef = useRef<AbortController | null>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    if (state.status === 'published') feedbackRef.current?.focus()
  }, [state.status])

  async function handlePublish() {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setState({ status: 'publishing' })

    try {
      const published = await publishEvent(event.id, token, controller.signal)
      if (controller.signal.aborted) return

      if (!published) {
        onSessionExpired()
        return
      }

      if (published.status !== 'PUBLISHED') {
        throw new Error('A API não confirmou a publicação.')
      }

      onPublished(event.id)
      setState({ status: 'published' })
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível publicar o evento.',
        })
      }
    } finally {
      requestRef.current = null
    }
  }

  if (state.status === 'published') {
    return <p ref={feedbackRef} tabIndex={-1} role="status">Evento publicado.</p>
  }

  if (event.status !== 'DRAFT') return null

  return (
    <div>
      <button
        type="button"
        aria-label={state.status === 'publishing' ? `Publicando ${event.title}` : `Publicar ${event.title}`}
        disabled={state.status === 'publishing'}
        onClick={() => void handlePublish()}
      >
        {state.status === 'publishing' ? 'Publicando…' : 'Publicar'}
      </button>
      {state.status === 'error' && <p role="alert">{state.message}</p>}
    </div>
  )
}
