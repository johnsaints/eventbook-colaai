import { apiUrl } from './api'

type HistoryEvent = {
  id: string
  title: string
  startsAt: string
  location: string
}

export type HistoryTicket = {
  id: string
  code: string
  orderId: string
  status: 'VALID' | 'USED' | 'CANCELLED'
  usedAt?: string | null
  event: HistoryEvent
  lot: { id: string; name: string }
}

export type HistoryOrder = {
  id: string
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED'
  totalAmount: string
  createdAt: string
  expiresAt: string
  paidAt: string | null
  cancelledAt: string | null
  event: HistoryEvent
}

export type HistoryPage<T> = {
  data: T[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export type HistoryAccess = 'login' | 'forbidden'

export type HistoryResult<T> =
  | { kind: 'ready'; page: HistoryPage<T> }
  | { kind: HistoryAccess }

async function listHistory<T>(
  path: string,
  page: number,
  token: string,
  signal: AbortSignal,
): Promise<HistoryResult<T>> {
  const response = await fetch(apiUrl + path + '?page=' + page, {
    headers: { Authorization: 'Bearer ' + token },
    signal,
    cache: 'no-store',
  })
  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403) return { kind: 'forbidden' }
  if (!response.ok) throw new Error('Falha ao consultar o histórico.')

  const result = (await response.json()) as HistoryPage<T>
  if (
    !Array.isArray(result?.data) || result.meta?.page !== page
    || !Number.isSafeInteger(result.meta.totalPages) || result.meta.totalPages < 0
  ) {
    throw new Error('Resposta inválida.')
  }
  return { kind: 'ready', page: result }
}

export function listMyTickets(page: number, token: string, signal: AbortSignal) {
  return listHistory<HistoryTicket>('/tickets/me', page, token, signal)
}

export function listMyOrders(page: number, token: string, signal: AbortSignal) {
  return listHistory<HistoryOrder>('/orders/me', page, token, signal)
}

export type CancelOrderResult =
  | { kind: 'cancelled' }
  | { kind: HistoryAccess }
  | { kind: 'blocked' | 'retry'; message: string }

export async function cancelMyOrder(
  id: string,
  token: string,
  signal: AbortSignal,
): Promise<CancelOrderResult> {
  const response = await fetch(apiUrl + '/orders/' + encodeURIComponent(id) + '/cancel', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    signal,
  })

  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403) return { kind: 'forbidden' }
  if (response.status === 404) {
    return { kind: 'blocked', message: 'Este pedido não está disponível para cancelamento.' }
  }

  const data = (await response.json().catch(() => null)) as {
    id?: string
    status?: string
    code?: string
  } | null
  if (response.ok && data?.id === id && data.status === 'CANCELLED') return { kind: 'cancelled' }
  if (data?.code === 'CANCELLATION_WINDOW_CLOSED') {
    return { kind: 'blocked', message: 'O prazo de cancelamento terminou 12 horas antes do início do evento.' }
  }
  if (data?.code === 'ORDER_EXPIRED') {
    return { kind: 'blocked', message: 'A reserva deste pedido expirou.' }
  }
  if (data?.code === 'ORDER_NOT_PENDING') {
    return { kind: 'blocked', message: 'Este pedido não está disponível para cancelamento.' }
  }
  return { kind: 'retry', message: 'Não foi possível confirmar o cancelamento. Tente novamente.' }
}
