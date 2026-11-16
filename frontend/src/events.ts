import { apiUrl } from './api'

export type EventSummary = {
  id: string
  title: string
  description: string
  location: string
  startsAt: string
}

type TicketLot = {
  id: string
  name: string
  price: string
  totalQuantity: number
  soldQuantity: number
  reservedQty: number
}

export type EventDetails = EventSummary & { lots: TicketLot[] }

export const formatDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function getEventCategoryVisual(event: Pick<EventSummary, 'title' | 'description'>): { label: string; tone: string } {
  const title = event.title.toLowerCase()
  const text = `${title} ${event.description.toLowerCase()}`
  if (title.includes('gastron')) return { label: 'Gastronomia', tone: 'tone-food' }
  if (title.includes('festival')) return { label: 'Festival', tone: 'tone-festival' }
  if (text.includes('show') || text.includes('turnê') || text.includes('música') || text.includes('eletrônico')) {
    return { label: 'Show & Festa', tone: 'tone-show' }
  }
  if (text.includes('teatro') || text.includes('stand-up') || text.includes('comédia')) {
    return { label: 'Teatro & Humor', tone: 'tone-theater' }
  }
  if (text.includes('futebol') || text.includes('clássico') || text.includes('estádio')) {
    return { label: 'Esportes', tone: 'tone-sports' }
  }
  if (text.includes('tecnologia') || text.includes('tech') || text.includes('cloud') || text.includes('summit')) {
    return { label: 'Tecnologia', tone: 'tone-tech' }
  }
  if (text.includes('gastron')) return { label: 'Gastronomia', tone: 'tone-food' }
  return { label: 'Evento', tone: 'tone-default' }
}

export async function getEvent(eventId: string, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/events/${encodeURIComponent(eventId)}`, { signal })

  if (response.status === 404) return null
  if (!response.ok) throw new Error('Falha ao consultar o evento.')

  const event = (await response.json()) as EventDetails
  if (!Array.isArray(event.lots)) throw new Error('Resposta inválida.')

  return event
}

export type OrganizerEvent = Pick<EventSummary, 'id' | 'title' | 'location' | 'startsAt'> & {
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
}

export async function getMyEvents(token: string, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/events/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (response.status === 401) return null
  if (!response.ok) throw new Error('Falha ao consultar meus eventos.')

  const { data } = (await response.json()) as { data: OrganizerEvent[] }
  if (!Array.isArray(data)) throw new Error('Resposta inválida.')

  return data
}

export type CreateEventInput = Pick<EventSummary, 'title' | 'description' | 'location' | 'startsAt'> & {
  endsAt: string
  capacity: number
}

export type EditableEvent = OrganizerEvent & CreateEventInput

export async function getEventForEdit(eventId: string, token: string, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (response.status === 401) return null
  if (response.status === 404) throw new Error('Evento não encontrado.')
  if (!response.ok) throw new Error('Não foi possível abrir o evento para edição.')

  return (await response.json()) as EditableEvent
}

async function saveEvent(
  url: string,
  method: 'POST' | 'PATCH',
  input: Partial<CreateEventInput>,
  token: string,
  signal: AbortSignal,
  messages?: Record<string, string>,
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  }).catch(() => {
    throw new Error('Não foi possível conectar à API.')
  })

  if (response.status === 401) return null

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { code?: string; message?: string } | null
    const message = error?.code ? messages?.[error.code] : undefined
    throw new Error(message ?? error?.message ?? 'Não foi possível salvar o evento.')
  }

  return (await response.json()) as OrganizerEvent
}

export function createEvent(input: CreateEventInput, token: string, signal: AbortSignal) {
  return saveEvent(`${apiUrl}/events`, 'POST', input, token, signal)
}

export function updateEvent(
  eventId: string,
  input: Partial<CreateEventInput>,
  token: string,
  signal: AbortSignal,
) {
  return saveEvent(`${apiUrl}/events/${encodeURIComponent(eventId)}`, 'PATCH', input, token, signal)
}

export function publishEvent(eventId: string, token: string, signal: AbortSignal) {
  return saveEvent(`${apiUrl}/events/${encodeURIComponent(eventId)}/publish`, 'POST', {}, token, signal, {
    EVENT_WITHOUT_LOTS: 'Cadastre pelo menos um lote em Ver lotes antes de publicar.',
    EVENT_IN_PAST: 'Eventos que já começaram não podem ser publicados.',
  })
}

export function toLocalInput(iso: string) {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
