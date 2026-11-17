export const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

export const sessionTokenKey = 'eventbook:token'
export const userUpdatedEventName = 'colaai:user-updated'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: 'BUYER' | 'ORGANIZER' | 'STAFF' | 'ADMIN'
  phone?: string | null
  city?: string | null
  bio?: string | null
  avatarImage?: string | null
  createdAt?: string
  updatedAt?: string
}

export type LoginSession = {
  token: string
  user: AuthUser
}

export type UpdateProfilePayload = {
  name?: string
  email?: string
  phone?: string | null
  city?: string | null
  bio?: string | null
  avatarImage?: string | null
}

export type MagicLinkRequestResponse = {
  message: string
  previewUrl?: string
}

export function notifyUserUpdated(user: AuthUser | null) {
  window.dispatchEvent(new CustomEvent<AuthUser | null>(userUpdatedEventName, { detail: user }))
}

function authRateLimitMessage(retryAfter: string | null) {
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
    throw new Error(body?.message ?? 'Confira os dados informados (mínimo 2 caracteres no nome e 6 na senha).')
  }
  if (response.status === 429) {
    throw new Error(authRateLimitMessage(response.headers.get('Retry-After')))
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
  if (response.status === 429) throw new Error(authRateLimitMessage(response.headers.get('Retry-After')))
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

export async function updateProfile(
  token: string,
  payload: UpdateProfilePayload,
  signal: AbortSignal,
): Promise<AuthUser | null> {
  const response = await fetch(`${apiUrl}/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (response.status === 401) return null
  if (response.status === 409) {
    throw new Error('Este e-mail já está em uso por outra conta.')
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Confira os dados preenchidos no perfil.')
  }
  if (!response.ok) {
    throw new Error('Não foi possível salvar seu perfil. Tente novamente.')
  }

  return (await response.json()) as AuthUser
}

export async function changePassword(
  token: string,
  payload: { currentPassword: string; newPassword: string },
  signal: AbortSignal,
): Promise<{ ok: true } | { ok: false; expired: boolean; message: string }> {
  const response = await fetch(`${apiUrl}/me/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (response.status === 401) {
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null
    if (body?.code === 'INVALID_CREDENTIALS') {
      return { ok: false, expired: false, message: body.message ?? 'Senha atual incorreta.' }
    }
    return { ok: false, expired: true, message: 'Sua sessão expirou. Entre novamente.' }
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    return { ok: false, expired: false, message: body?.message ?? 'Verifique as senhas informadas.' }
  }
  if (!response.ok) {
    return { ok: false, expired: false, message: 'Não foi possível alterar a senha.' }
  }

  return { ok: true }
}

export async function requestMagicLink(
  email: string,
  signal: AbortSignal,
): Promise<MagicLinkRequestResponse> {
  const response = await fetch(`${apiUrl}/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    signal,
  })

  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Informe um e-mail válido.')
  }
  if (response.status === 429) {
    throw new Error(authRateLimitMessage(response.headers.get('Retry-After')))
  }
  if (response.status === 503) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(
      body?.message ?? 'O envio de link mágico por e-mail ainda não está configurado neste servidor.',
    )
  }
  if (!response.ok) {
    throw new Error('Não foi possível enviar o link mágico agora. Tente novamente.')
  }

  return (await response.json()) as MagicLinkRequestResponse
}

export async function verifyMagicLink(token: string, signal?: AbortSignal): Promise<LoginSession> {
  const response = await fetch(`${apiUrl}/auth/magic-link/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    signal,
  })

  if (response.status === 401 || response.status === 400) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? 'Link mágico inválido ou expirado. Solicite um novo acesso.')
  }
  if (response.status === 429) {
    throw new Error(authRateLimitMessage(response.headers.get('Retry-After')))
  }
  if (!response.ok) {
    throw new Error('Não foi possível validar o link mágico.')
  }

  const session = (await response.json().catch(() => null)) as LoginSession | null
  if (typeof session?.token !== 'string' || !session.token || !session.user?.name) {
    throw new Error('A API não confirmou a sessão. Tente novamente.')
  }
  return session
}
