export const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

export const sessionTokenKey = 'eventbook:token'
export const sessionUserKey = 'eventbook:user'
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

export type UserRole = AuthUser['role']

const validRoles: ReadonlySet<UserRole> = new Set(['BUYER', 'ORGANIZER', 'STAFF', 'ADMIN'])

export const ROLE_LABELS: Record<UserRole, string> = {
  BUYER: 'Comprador',
  ORGANIZER: 'Organizador',
  STAFF: 'Equipe de Check-in',
  ADMIN: 'Administrador',
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  BUYER: [
    'Explorar vitrine, reservar e simular compra de ingressos',
    'Acessar Meus Ingressos, QR Codes e histórico de pedidos',
    'Editar dados cadastrais, foto de perfil e senha em Meu Perfil',
  ],
  ORGANIZER: [
    'Acessar o Painel para criar, editar e publicar eventos e lotes',
    'Vincular equipe de portaria (STAFF) e acompanhar ocupação dos próprios eventos',
    'Editar dados cadastrais, foto de perfil e senha em Meu Perfil',
  ],
  STAFF: [
    'Acessar a área de Check-in e validar ingressos dos eventos vinculados',
    'Consultar apenas os eventos atribuídos à sua escala de portaria',
    'Editar dados cadastrais, foto de perfil e senha em Meu Perfil',
  ],
  ADMIN: [
    'Acesso completo às abas Meus Ingressos, Painel e Check-in para testes e supervisão',
    'Gerenciar contas cadastradas e atribuir perfis (Comprador, Organizador, Equipe ou Admin)',
    'Consultar eventos de toda a plataforma e testar reservas e validações na portaria',
  ],
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

function persistSessionUser(user: AuthUser | null) {
  if (!user) {
    sessionStorage.removeItem(sessionUserKey)
    return
  }
  try {
    sessionStorage.setItem(sessionUserKey, JSON.stringify(user))
  } catch {
    try {
      const { avatarImage: _ignored, ...withoutAvatar } = user
      sessionStorage.setItem(sessionUserKey, JSON.stringify(withoutAvatar))
    } catch {
      sessionStorage.removeItem(sessionUserKey)
    }
  }
}

function parseJwtClaims(token: string): { sub?: string; role?: UserRole } | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded)) as { sub?: unknown; role?: unknown }
    const role = typeof decoded.role === 'string' && validRoles.has(decoded.role as UserRole)
      ? (decoded.role as UserRole)
      : undefined
    const sub = typeof decoded.sub === 'string' ? decoded.sub : undefined
    return sub && role ? { sub, role } : null
  } catch {
    return null
  }
}

export function getStoredSessionUser(): AuthUser | null {
  const token = sessionStorage.getItem(sessionTokenKey)
  if (!token) {
    sessionStorage.removeItem(sessionUserKey)
    return null
  }

  try {
    const raw = sessionStorage.getItem(sessionUserKey)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuthUser> | null
      if (
        parsed
        && typeof parsed.id === 'string'
        && typeof parsed.name === 'string'
        && parsed.role
        && validRoles.has(parsed.role)
      ) {
        return parsed as AuthUser
      }
    }
  } catch {
    sessionStorage.removeItem(sessionUserKey)
  }

  const claims = parseJwtClaims(token)
  if (!claims?.sub || !claims.role) return null
  return {
    id: claims.sub,
    name: 'Minha Conta',
    email: '',
    role: claims.role,
  }
}

export function notifyUserUpdated(user: AuthUser | null) {
  persistSessionUser(user)
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

export function canAccessBuyerTickets(role?: UserRole | null) {
  return role === 'BUYER' || role === 'ADMIN'
}

export function canAccessPanel(role?: UserRole | null) {
  return role === 'ORGANIZER' || role === 'ADMIN'
}

export function canAccessCheckin(role?: UserRole | null) {
  return role === 'STAFF' || role === 'ADMIN'
}

export function isAdminRole(role?: UserRole | null) {
  return role === 'ADMIN'
}

export function defaultRouteForRole(role: UserRole): string {
  if (role === 'STAFF') return '/check-in'
  if (role === 'ORGANIZER' || role === 'ADMIN') return '/painel'
  return '/'
}

export async function getCurrentUser(token: string, signal: AbortSignal) {
  const response = await fetch(`${apiUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (response.status === 401 || response.status === 404) {
    if (sessionStorage.getItem(sessionTokenKey) === token) {
      sessionStorage.removeItem(sessionUserKey)
    }
    return null
  }
  if (!response.ok) throw new Error('Falha ao consultar o perfil.')

  const loaded = (await response.json()) as AuthUser
  if (sessionStorage.getItem(sessionTokenKey) === token) {
    persistSessionUser(loaded)
  }
  return loaded
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

export type AdminUsersResult =
  | { kind: 'ready'; users: AuthUser[] }
  | { kind: 'login' }
  | { kind: 'forbidden' }

export async function listUsersForAdmin(
  token: string,
  params: { q?: string; role?: string },
  signal: AbortSignal,
): Promise<AdminUsersResult> {
  const search = new URLSearchParams()
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.role?.trim()) search.set('role', params.role.trim())
  const qs = search.toString()

  const response = await fetch(`${apiUrl}/admin/users${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  })

  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403) return { kind: 'forbidden' }
  if (!response.ok) throw new Error('Não foi possível carregar as contas cadastradas.')

  const body = (await response.json()) as { data?: AuthUser[] }
  if (!Array.isArray(body?.data)) throw new Error('Resposta inválida da lista de usuários.')
  return { kind: 'ready', users: body.data }
}

export type UpdateUserRoleResult =
  | { kind: 'updated'; user: AuthUser }
  | { kind: 'login' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }

export async function updateUserRoleByAdmin(
  token: string,
  userId: string,
  role: UserRole,
  signal: AbortSignal,
): Promise<UpdateUserRoleResult> {
  const response = await fetch(`${apiUrl}/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ role }),
    signal,
  })

  if (response.status === 401) return { kind: 'login' }
  if (response.status === 403) return { kind: 'forbidden' }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    return {
      kind: 'error',
      message: body?.message ?? 'Não foi possível atualizar o perfil desta conta.',
    }
  }

  const updated = (await response.json()) as AuthUser
  return { kind: 'updated', user: updated }
}
