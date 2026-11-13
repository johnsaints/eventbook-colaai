import { apiUrl } from './api'

export type LotInput = {
  name: string
  price: number
  quantity: number
  salesStartAt: string
  salesEndAt: string
  active: boolean
}

export type ManagedLot = Omit<LotInput, 'price'> & {
  id: string
  price: string
  availableQuantity: number
}

function lotsUrl(eventId: string) {
  return `${apiUrl}/events/${encodeURIComponent(eventId)}/lots`
}

export async function getManagedLots(eventId: string, token: string, signal: AbortSignal) {
  const response = await fetch(`${lotsUrl(eventId)}/manage`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (response.status === 401) return null
  if (!response.ok) throw new Error('Não foi possível carregar os lotes.')

  const lots = (await response.json()) as ManagedLot[]
  if (!Array.isArray(lots)) throw new Error('Resposta inválida.')

  return lots
}

async function saveLot(
  url: string,
  method: 'POST' | 'PATCH',
  input: Partial<LotInput>,
  token: string,
  signal: AbortSignal,
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

  if (response.status === 401) return false
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(error?.message ?? 'Não foi possível salvar o lote.')
  }

  return true
}

export function createLot(eventId: string, input: LotInput, token: string, signal: AbortSignal) {
  return saveLot(lotsUrl(eventId), 'POST', input, token, signal)
}

export function updateLot(
  eventId: string,
  lotId: string,
  input: Partial<LotInput>,
  token: string,
  signal: AbortSignal,
) {
  return saveLot(`${lotsUrl(eventId)}/${encodeURIComponent(lotId)}`, 'PATCH', input, token, signal)
}
