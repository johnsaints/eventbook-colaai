import { apiUrl } from './api'

export type ReservationItem = { lotId: string; quantity: number }

export type ReservationDraft = {
  eventId: string
  items: ReservationItem[]
}

export type Reservation = {
  id: string
  eventId: string
  status: 'PENDING'
  totalAmount: string
  expiresAt: string
  items: (ReservationItem & { unitPriceSnapshot: string })[]
}

type ReservationResult =
  | { kind: 'reserved'; order: Reservation }
  | { kind: 'login' }
  | { kind: 'buyer' | 'availability' | 'rejected'; message: string }

const formatBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moneyPattern = /^\d+(\.\d{1,2})?$/

export function priceInCents(price: string) {
  const [units, cents = ''] = price.split('.')
  return BigInt(units) * 100n + BigInt(cents.padEnd(2, '0'))
}

export function formatPrice(cents: bigint) {
  const fraction = String(cents % 100n).padStart(2, '0')
  return formatBRL.formatToParts(cents / 100n)
    .map(part => part.type === 'fraction' ? fraction : part.value)
    .join('')
}

function isMoney(value: unknown): value is string {
  return typeof value === 'string' && moneyPattern.test(value)
}

export async function reserveTickets(
  draft: ReservationDraft,
  token: string,
  signal: AbortSignal,
): Promise<ReservationResult> {
  const response = await fetch(apiUrl + '/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(draft),
    signal,
  })

  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403) {
    return { kind: 'buyer', message: 'Entre com uma conta de comprador para reservar ingressos.' }
  }
  if (response.status === 400) {
    return { kind: 'rejected', message: 'Confira as quantidades selecionadas e tente novamente.' }
  }
  if (response.status === 404) {
    const error = (await response.json().catch(() => null)) as { code?: string } | null
    if (error?.code === 'EVENT_NOT_FOUND') {
      return { kind: 'availability', message: 'Este evento não está mais disponível para reservas.' }
    }
  }
  if (response.status === 409 || response.status === 422 || response.status === 404) {
    return {
      kind: 'availability',
      message: response.status === 409
        ? 'O estoque mudou durante a seleção. Confira a quantidade disponível e tente novamente.'
        : 'Um dos lotes já não está à venda. Confira os lotes disponíveis.',
    }
  }
  if (!response.ok) return { kind: 'rejected', message: 'A API não confirmou a reserva. Tente novamente.' }

  const order = (await response.json()) as Reservation
  if (
    typeof order?.id !== 'string' || order.eventId !== draft.eventId || order.status !== 'PENDING'
    || !isMoney(order.totalAmount) || !Number.isFinite(Date.parse(order.expiresAt))
    || !Array.isArray(order.items) || order.items.length !== draft.items.length
    || !order.items.every(item =>
      item && isMoney(item.unitPriceSnapshot)
      && draft.items.some(selected => selected.lotId === item.lotId && selected.quantity === item.quantity)
    )
  ) {
    throw new Error('Resposta de reserva inválida.')
  }

  return { kind: 'reserved', order }
}

export type CheckoutResult =
  | { kind: 'paid'; totalAmount: string; ticketCount: number }
  | { kind: 'retry'; message: string }
  | { kind: 'expired' | 'cancelled' | 'login' | 'unavailable' }

const checkoutRetry: CheckoutResult = {
  kind: 'retry',
  message: 'Não foi possível confirmar o pagamento. Tente novamente.',
}

function orderPath(order: Reservation) {
  return apiUrl + '/orders/' + encodeURIComponent(order.id)
}

async function checkPaymentStatus(
  order: Reservation,
  headers: HeadersInit,
  signal: AbortSignal,
): Promise<CheckoutResult> {
  const response = await fetch(orderPath(order), { headers, signal, cache: 'no-store' })
  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403 || response.status === 404) return { kind: 'unavailable' }
  if (!response.ok) return checkoutRetry

  const current = (await response.json()) as { id?: string; status?: string; totalAmount?: string }
  if (current?.id !== order.id) return checkoutRetry
  if (current.status === 'PAID' && isMoney(current.totalAmount)) {
    return {
      kind: 'paid',
      totalAmount: current.totalAmount,
      ticketCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    }
  }
  if (current.status === 'EXPIRED') return { kind: 'expired' }
  if (current.status === 'CANCELLED') return { kind: 'cancelled' }
  return checkoutRetry
}

export async function payReservation(
  order: Reservation,
  token: string,
  signal: AbortSignal,
): Promise<CheckoutResult> {
  const headers = { Authorization: 'Bearer ' + token }
  let response: Response
  try {
    response = await fetch(orderPath(order) + '/checkout', { method: 'POST', headers, signal })
  } catch (error) {
    if (signal.aborted) throw error
    return checkPaymentStatus(order, headers, signal)
  }

  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403 || response.status === 404) return { kind: 'unavailable' }
  if (response.status === 409) return checkPaymentStatus(order, headers, signal)

  const result = (await response.json().catch(() => null)) as {
    id?: string
    status?: string
    code?: string
    totalAmount?: string
    ticketCount?: number
  } | null

  if (response.ok) {
    if (
      result?.id === order.id && result.status === 'PAID' && isMoney(result.totalAmount)
      && typeof result.ticketCount === 'number' && Number.isSafeInteger(result.ticketCount) && result.ticketCount > 0
    ) {
      return { kind: 'paid', totalAmount: result.totalAmount, ticketCount: result.ticketCount }
    }
    return checkPaymentStatus(order, headers, signal)
  }
  if (response.status === 422 && result?.code === 'ORDER_EXPIRED') return { kind: 'expired' }
  if (response.status === 422 && result?.code === 'PAYMENT_DECLINED') {
    return { kind: 'retry', message: 'O pagamento simulado foi recusado. Tente novamente.' }
  }
  return checkoutRetry
}
