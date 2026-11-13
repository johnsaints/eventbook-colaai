import { apiUrl } from './api'

export type OccupancyMetrics = {
  totalTickets: number
  soldTickets: number
  checkIns: number
  occupancyPercentage: number
}

export type OccupancyLot = OccupancyMetrics & {
  id: string
  name: string
}

export type EventOccupancy = {
  eventId: string
  totals: OccupancyMetrics
  lots: OccupancyLot[]
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isMetrics(value: unknown): value is OccupancyMetrics {
  const metrics = value as Partial<OccupancyMetrics> | null
  return isCount(metrics?.totalTickets) && isCount(metrics?.soldTickets) && isCount(metrics?.checkIns)
    && typeof metrics?.occupancyPercentage === 'number'
    && Number.isFinite(metrics.occupancyPercentage) && metrics.occupancyPercentage >= 0
}

function isLot(value: unknown): value is OccupancyLot {
  const lot = value as Partial<OccupancyLot> | null
  return typeof lot?.id === 'string' && typeof lot.name === 'string' && isMetrics(lot)
}

export async function getEventOccupancy(
  eventId: string,
  token: string,
  signal: AbortSignal,
): Promise<EventOccupancy | null> {
  const response = await fetch(`${apiUrl}/events/${encodeURIComponent(eventId)}/occupancy`, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal,
  })

  if (response.status === 401) return null
  if (response.status === 403) throw new Error('Você não tem permissão para consultar a ocupação deste evento.')
  if (response.status === 404) throw new Error('Evento não encontrado.')
  if (!response.ok) throw new Error('Não foi possível carregar a ocupação.')

  const data = (await response.json().catch(() => null)) as Partial<EventOccupancy> | null
  if (data?.eventId !== eventId || !isMetrics(data.totals) || !Array.isArray(data.lots) || !data.lots.every(isLot)) {
    throw new Error('A API retornou dados de ocupação inválidos.')
  }

  return { eventId, totals: data.totals, lots: data.lots }
}
