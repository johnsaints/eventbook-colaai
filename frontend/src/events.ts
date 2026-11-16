import { apiUrl } from './api'
import coverDefault from './assets/covers/cover-default.jpg'
import coverFestival from './assets/covers/cover-festival.jpg'
import coverFood from './assets/covers/cover-food.jpg'
import coverShow from './assets/covers/cover-show.jpg'
import coverSports from './assets/covers/cover-sports.jpg'
import coverTech from './assets/covers/cover-tech.jpg'
import coverTheater from './assets/covers/cover-theater.jpg'

export type EventSummary = {
  id: string
  title: string
  description: string
  location: string
  startsAt: string
  coverImage?: string | null
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

export function getEventCategoryVisual(
  event: Pick<EventSummary, 'title' | 'description'>,
): { label: string; tone: string; coverSrc: string } {
  const title = event.title.toLowerCase()
  const text = `${title} ${event.description.toLowerCase()}`
  if (title.includes('gastron')) return { label: 'Gastronomia', tone: 'tone-food', coverSrc: coverFood }
  if (title.includes('festival')) return { label: 'Festival', tone: 'tone-festival', coverSrc: coverFestival }
  if (text.includes('show') || text.includes('turnê') || text.includes('música') || text.includes('eletrônico')) {
    return { label: 'Show & Festa', tone: 'tone-show', coverSrc: coverShow }
  }
  if (text.includes('teatro') || text.includes('stand-up') || text.includes('comédia')) {
    return { label: 'Teatro & Humor', tone: 'tone-theater', coverSrc: coverTheater }
  }
  if (text.includes('futebol') || text.includes('clássico') || text.includes('estádio')) {
    return { label: 'Esportes', tone: 'tone-sports', coverSrc: coverSports }
  }
  if (text.includes('tecnologia') || text.includes('tech') || text.includes('cloud') || text.includes('summit')) {
    return { label: 'Tecnologia', tone: 'tone-tech', coverSrc: coverTech }
  }
  if (text.includes('gastron')) return { label: 'Gastronomia', tone: 'tone-food', coverSrc: coverFood }
  return { label: 'Evento', tone: 'tone-default', coverSrc: coverDefault }
}

export function resolveEventCoverSrc(
  event: Pick<EventSummary, 'title' | 'description' | 'coverImage'>,
): string {
  return event.coverImage || getEventCategoryVisual(event).coverSrc
}

const ALLOWED_COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_COVER_WIDTH = 1280
const MAX_COVER_HEIGHT = 720
const MAX_COVER_DATA_URL_LENGTH = 1_350_000

/** Redimensiona e otimiza a imagem escolhida no navegador para caber em 16:9 sem pesar na API. */
export async function prepareCoverUpload(file: File): Promise<string> {
  if (!ALLOWED_COVER_TYPES.has(file.type)) {
    throw new Error('Escolha uma imagem PNG, JPEG ou WebP.')
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('A imagem selecionada excede 12 MB.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    await img.decode()

    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('Não foi possível ler as dimensões da imagem.')
    }

    const scale = Math.min(1, MAX_COVER_WIDTH / img.naturalWidth, MAX_COVER_HEIGHT / img.naturalHeight)
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Navegador sem suporte para processar imagem.')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    const outputType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg'
    const encoded = canvas.toDataURL(outputType, 0.86)
    const finalUrl = encoded.startsWith('data:image/webp') || outputType === 'image/jpeg'
      ? encoded
      : canvas.toDataURL('image/jpeg', 0.86)

    if (finalUrl.length > MAX_COVER_DATA_URL_LENGTH) {
      const compact = canvas.toDataURL('image/jpeg', 0.72)
      if (compact.length > MAX_COVER_DATA_URL_LENGTH) {
        throw new Error('A imagem ficou grande demais mesmo após compressão. Tente outra foto.')
      }
      return compact
    }

    return finalUrl
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('Não foi possível processar a imagem selecionada.')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
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

export type CreateEventInput = Pick<EventSummary, 'title' | 'description' | 'location' | 'startsAt' | 'coverImage'> & {
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
