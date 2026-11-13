export const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

export const sessionTokenKey = 'eventbook:token'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: 'BUYER' | 'ORGANIZER' | 'STAFF' | 'ADMIN'
}

type LoginSession = {
  token: string
  user: AuthUser
}

function loginRateLimitMessage(retryAfter: string | null) {
  const seconds = Number(retryAfter)
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return 'Muitas tentativas. Tente novamente em alguns minutos.'
  }

  const duration = new Intl.NumberFormat('pt-BR', {
    style: 'unit',
    unit: seconds >= 60 ? 'minute' : 'second',
    unitDisplay: 'long',
  }).format(seconds >= 60 ? Math.ceil(seconds / 60) : seconds)
  return 'Muitas tentativas. Aguarde ' + duration + ' antes de tentar novamente.'
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
  signal: AbortSignal,
) {
  const response = await fetch(`${apiUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
    signal,
  })

  if (response.status === 409) {
    throw new Error('Este e-mail já está cadastrado. Tente entrar na sua conta.')
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Confira os dados informados (mínimo 3 caracteres no nome e 6 na senha).')
  }
  if (response.status === 429) {
    throw new Error(loginRateLimitMessage(response.headers.get('Retry-After')))
  }
  if (!response.ok) {
    throw new Error('Não foi possível criar sua conta. Tente novamente.')
  }

  return (await response.json()) as AuthUser
}

export async function login(email: string, password: string, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal,
  })

  if (response.status === 401) return null
  if (response.status === 400) throw new Error('Confira o e-mail e a senha informados.')
  if (response.status === 429) throw new Error(loginRateLimitMessage(response.headers.get('Retry-After')))
  if (!response.ok) throw new Error('Não foi possível entrar. Tente novamente.')

  const session = (await response.json().catch(() => null)) as LoginSession | null
  if (typeof session?.token !== 'string' || !session.token || !session.user?.name) {
    throw new Error('A API não confirmou a sessão. Tente novamente.')
  }
  return session
}

export function canAccessPanel(role: AuthUser['role']) {
  return role === 'ORGANIZER' || role === 'ADMIN'
}

export async function getCurrentUser(token: string, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (response.status === 401 || response.status === 404) return null
  if (!response.ok) throw new Error('Falha ao consultar o perfil.')

  return (await response.json()) as AuthUser
}
