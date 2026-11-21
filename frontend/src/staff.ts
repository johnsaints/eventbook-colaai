import { useEffect, useState } from 'react'
import { apiUrl } from './api'

export type StaffMember = {
  userId: string
  name: string
  email: string
  createdAt: string
}

export type StaffCandidate = {
  userId: string
  name: string
  email: string
  inDefaultTeam: boolean
  assignedToEvent: boolean
}

export type ProvisionStaffInput = {
  name: string
  email: string
  password?: string
  addToDefaultTeam?: boolean
  eventId?: string
}

export type ProvisionStaffResult = {
  member: StaffMember
  addedToDefaultTeam: boolean
  assignedToEvent: boolean
  temporaryPassword?: string
}

export type ApplyDefaultStaffResult = {
  addedCount: number
  members: StaffMember[]
}

function staffUrl(eventId: string) {
  return `${apiUrl}/events/${encodeURIComponent(eventId)}/staff`
}

function organizerStaffUrl() {
  return `${apiUrl}/organizer/staff`
}

function isStaffMember(value: unknown): value is StaffMember {
  const member = value as Partial<StaffMember> | null
  return typeof member?.userId === 'string' && typeof member.name === 'string'
    && typeof member.email === 'string' && typeof member.createdAt === 'string'
}

function isStaffCandidate(value: unknown): value is StaffCandidate {
  const candidate = value as Partial<StaffCandidate> | null
  return typeof candidate?.userId === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.email === 'string'
    && typeof candidate.inDefaultTeam === 'boolean'
    && typeof candidate.assignedToEvent === 'boolean'
}

async function staffRequest(
  url: string,
  token: string,
  signal: AbortSignal,
  method: 'GET' | 'POST' | 'DELETE',
  fallback: string,
  input?: Record<string, unknown>,
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

export async function applyDefaultStaffToEvent(
  eventId: string,
  token: string,
  signal: AbortSignal,
): Promise<ApplyDefaultStaffResult | null> {
  const url = `${staffUrl(eventId)}/apply-default`
  const response = await staffRequest(url, token, signal, 'POST', 'Não foi possível aplicar a equipe padrão.')
  if (!response) return null

  const payload = (await response.json()) as Partial<ApplyDefaultStaffResult> | null
  if (
    typeof payload?.addedCount !== 'number'
    || !Array.isArray(payload.members)
    || !payload.members.every(isStaffMember)
  ) {
    throw new Error('Resposta inválida ao aplicar a equipe padrão.')
  }
  return { addedCount: payload.addedCount, members: payload.members }
}

export async function listOrganizerDefaultStaff(token: string, signal: AbortSignal) {
  const response = await staffRequest(
    organizerStaffUrl(),
    token,
    signal,
    'GET',
    'Não foi possível carregar sua equipe padrão.',
  )
  if (!response) return null

  const members: unknown = await response.json()
  if (!Array.isArray(members) || !members.every(isStaffMember)) {
    throw new Error('Resposta de equipe padrão inválida.')
  }
  return members
}

export async function addOrganizerDefaultStaff(email: string, token: string, signal: AbortSignal) {
  const response = await staffRequest(
    organizerStaffUrl(),
    token,
    signal,
    'POST',
    'Não foi possível adicionar à equipe padrão.',
    { email },
  )
  if (!response) return null

  const member: unknown = await response.json()
  if (!isStaffMember(member)) throw new Error('Resposta de equipe padrão inválida.')
  return member
}

export async function removeOrganizerDefaultStaff(userId: string, token: string, signal: AbortSignal) {
  const url = `${organizerStaffUrl()}/${encodeURIComponent(userId)}`
  const response = await staffRequest(url, token, signal, 'DELETE', 'Não foi possível remover da equipe padrão.')
  return response ? true : null
}

export async function searchStaffCandidates(
  params: { q?: string; eventId?: string },
  token: string,
  signal: AbortSignal,
): Promise<StaffCandidate[] | null> {
  const search = new URLSearchParams()
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.eventId) search.set('eventId', params.eventId)
  const qs = search.toString()
  const url = `${organizerStaffUrl()}/candidates${qs ? `?${qs}` : ''}`
  const response = await staffRequest(url, token, signal, 'GET', 'Não foi possível buscar contas STAFF.')
  if (!response) return null

  const candidates: unknown = await response.json()
  if (!Array.isArray(candidates) || !candidates.every(isStaffCandidate)) {
    throw new Error('Resposta de candidatos STAFF inválida.')
  }
  return candidates
}

export async function provisionStaffMember(
  input: ProvisionStaffInput,
  token: string,
  signal: AbortSignal,
): Promise<ProvisionStaffResult | null> {
  const response = await staffRequest(
    `${organizerStaffUrl()}/provision`,
    token,
    signal,
    'POST',
    'Não foi possível cadastrar o integrante de portaria.',
    input,
  )
  if (!response) return null

  const payload = (await response.json()) as Partial<ProvisionStaffResult> | null
  if (
    !payload
    || !isStaffMember(payload.member)
    || typeof payload.addedToDefaultTeam !== 'boolean'
    || typeof payload.assignedToEvent !== 'boolean'
  ) {
    throw new Error('Resposta inválida ao cadastrar integrante.')
  }
  return payload as ProvisionStaffResult
}

export function useStaffCandidates({
  enabled,
  query,
  eventId,
  token,
  revision,
  onSessionExpired,
}: {
  enabled: boolean
  query: string
  eventId?: string
  token: string
  revision: number
  onSessionExpired: () => void
}) {
  const [candidates, setCandidates] = useState<StaffCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      searchStaffCandidates({ q: query, eventId }, token, controller.signal)
        .then((list) => {
          if (controller.signal.aborted) return
          if (!list) {
            onSessionExpired()
            return
          }
          setCandidates(list)
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setError(err instanceof Error ? err.message : 'Não foi possível buscar contas STAFF.')
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, query ? 180 : 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, query, eventId, token, revision, onSessionExpired])

  return { candidates, setCandidates, loading, error }
}
