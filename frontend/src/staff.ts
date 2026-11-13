import { apiUrl } from './api'

export type StaffMember = {
  userId: string
  name: string
  email: string
  createdAt: string
}

function staffUrl(eventId: string) {
  return `${apiUrl}/events/${encodeURIComponent(eventId)}/staff`
}

function isStaffMember(value: unknown): value is StaffMember {
  const member = value as Partial<StaffMember> | null
  return typeof member?.userId === 'string' && typeof member.name === 'string'
    && typeof member.email === 'string' && typeof member.createdAt === 'string'
}

async function staffRequest(
  url: string,
  token: string,
  signal: AbortSignal,
  method: 'GET' | 'POST' | 'DELETE',
  fallback: string,
  input?: { email: string },
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input && { 'Content-Type': 'application/json' }),
    },
    body: input ? JSON.stringify(input) : undefined,
    signal,
    cache: 'no-store',
  })
  if (response.status === 401) return null
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: unknown } | null
    throw new Error(typeof error?.message === 'string' ? error.message : fallback)
  }
  return response
}

export async function listEventStaff(eventId: string, token: string, signal: AbortSignal) {
  const response = await staffRequest(staffUrl(eventId), token, signal, 'GET', 'Não foi possível carregar a equipe.')
  if (!response) return null

  const members: unknown = await response.json()
  if (!Array.isArray(members) || !members.every(isStaffMember)) throw new Error('Resposta de equipe inválida.')
  return members
}

export async function addEventStaff(eventId: string, email: string, token: string, signal: AbortSignal) {
  const response = await staffRequest(staffUrl(eventId), token, signal, 'POST', 'Não foi possível adicionar à equipe.', { email })
  if (!response) return null

  const member: unknown = await response.json()
  if (!isStaffMember(member)) throw new Error('Resposta de equipe inválida.')
  return member
}

export async function removeEventStaff(eventId: string, userId: string, token: string, signal: AbortSignal) {
  const url = staffUrl(eventId) + '/' + encodeURIComponent(userId)
  const response = await staffRequest(url, token, signal, 'DELETE', 'Não foi possível remover da equipe.')
  return response ? true : null
}
