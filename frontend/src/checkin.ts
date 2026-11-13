import { apiUrl } from './api'

export type CheckinEvent = {
  id: string
  title: string
  location: string
  startsAt: string
}

export type CheckinResult =
  | { status: 'approved'; code: string; checkedInAt: string }
  | { status: 'duplicate' | 'rejected' | 'error'; message: string }

function isCheckinEvent(value: unknown): value is CheckinEvent {
  const event = value as Partial<CheckinEvent> | null
  return typeof event?.id === 'string' && typeof event.title === 'string'
    && typeof event.location === 'string' && typeof event.startsAt === 'string'
    && Number.isFinite(Date.parse(event.startsAt))
}

export async function listCheckinEvents(token: string, signal: AbortSignal) {
  const response = await fetch(apiUrl + '/staff/events', {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal,
  })
  if (response.status === 401) return { status: 'signed-out' } as const
  if (response.status === 403) return { status: 'forbidden' } as const
  if (!response.ok) throw new Error('Não foi possível carregar os eventos.')

  const events: unknown = await response.json()
  if (!Array.isArray(events) || !events.every(isCheckinEvent)) {
    throw new Error('Resposta de eventos inválida.')
  }
  return { status: 'ready', events } as const
}

export async function submitCheckin(
  token: string, eventId: string, code: string, signal: AbortSignal,
): Promise<CheckinResult | { status: 'signed-out' }> {
  const response = await fetch(apiUrl + '/tickets/' + encodeURIComponent(code) + '/checkin', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
    signal,
  })

  if (response.status === 401) return { status: 'signed-out' }
  if (response.status === 409) {
    return { status: 'duplicate', message: 'Este ingresso já foi utilizado.' }
  }
  if (response.status === 403) {
    return { status: 'rejected', message: 'Sua conta não tem permissão para fazer check-in neste evento.' }
  }
  if ([400, 404, 422].includes(response.status)) {
    const error = (await response.json().catch(() => null)) as { message?: unknown } | null
    return {
      status: 'rejected',
      message: typeof error?.message === 'string' ? error.message : 'Confira o evento e o código do ingresso.',
    }
  }
  if (!response.ok) throw new Error('Falha ao registrar o check-in.')

  const record = (await response.json()) as { status?: string; eventId?: string; checkedInAt?: string }
  if (record?.status !== 'USED' || record.eventId !== eventId
    || typeof record.checkedInAt !== 'string' || !Number.isFinite(Date.parse(record.checkedInAt))) {
    throw new Error('Resposta de check-in inválida.')
  }

  return { status: 'approved', code, checkedInAt: record.checkedInAt }
}
