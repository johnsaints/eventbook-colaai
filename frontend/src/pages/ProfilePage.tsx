import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  canAccessBuyerTickets,
  canAccessCheckin,
  canAccessPanel,
  changePassword,
  getCurrentUser,
  isAdminRole,
  listUsersForAdmin,
  notifyUserUpdated,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  sessionTokenKey,
  updateProfile,
  updateUserRoleByAdmin,
  type AuthUser,
  type UserRole,
} from '../api'
import AppLayout from '../components/AppLayout'
import {
  ArrowLeftIcon,
  CloseIcon,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
} from '../components/Icons'
import { prepareImageUpload } from '../imageUpload'
import './ProfilePage.css'

const formatMemberSince = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
})

function prepareAvatarUpload(file: File): Promise<string> {
  return prepareImageUpload(file, {
    maxWidth: 360,
    maxHeight: 360,
    maxDataUrlLength: 600_000,
    cropSquare: true,
  })
}

const ALL_ROLES: UserRole[] = ['BUYER', 'ORGANIZER', 'STAFF', 'ADMIN']

function AdminUsersSection({
  token,
  currentUserId,
  onSessionExpired,
}: {
  token: string
  currentUserId: string
  onSessionExpired: () => void
}) {
  const [searchInput, setSearchInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const queryKey = `${appliedQuery}|${roleFilter}|${reloadTick}`
  const [fetchState, setFetchState] = useState<{
    key: string
    users: AuthUser[]
    error: string
  } | null>(null)
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({})
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState('')
  const [actionError, setActionError] = useState('')
  const updateReqRef = useRef<AbortController | null>(null)

  const loading = fetchState?.key !== queryKey
  const loadError = fetchState?.key === queryKey ? fetchState.error : ''
  const users = loadError ? [] : (fetchState?.users ?? [])

  useEffect(() => () => updateReqRef.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()

    listUsersForAdmin(token, { q: appliedQuery, role: roleFilter }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.kind === 'login') {
          onSessionExpired()
          return
        }
        if (result.kind === 'forbidden') {
          setFetchState({
            key: queryKey,
            users: [],
            error: 'Apenas contas administrativas podem listar ou alterar perfis.',
          })
          return
        }
        setFetchState({ key: queryKey, users: result.users, error: '' })
        setDraftRoles(Object.fromEntries(result.users.map((item) => [item.id, item.role])))
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setFetchState({
            key: queryKey,
            users: [],
            error: error instanceof Error ? error.message : 'Falha ao consultar contas.',
          })
        }
      })

    return () => controller.abort()
  }, [appliedQuery, onSessionExpired, queryKey, roleFilter, token])

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionStatus('')
    setActionError('')
    setAppliedQuery(searchInput.trim())
    setReloadTick((prev) => prev + 1)
  }

  async function handleSaveRole(targetUser: AuthUser) {
    const nextRole = draftRoles[targetUser.id] ?? targetUser.role
    if (updateReqRef.current || targetUser.id === currentUserId || nextRole === targetUser.role) {
      return
    }

    const controller = new AbortController()
    updateReqRef.current = controller
    setSavingUserId(targetUser.id)
    setActionStatus('')
    setActionError('')

    try {
      const result = await updateUserRoleByAdmin(token, targetUser.id, nextRole, controller.signal)
      if (controller.signal.aborted) return

      if (result.kind === 'login') {
        onSessionExpired()
        return
      }
      if (result.kind === 'forbidden') {
        setActionError('Sua conta não tem permissão para alterar perfis.')
        return
      }
      if (result.kind === 'error') {
        setActionError(result.message)
        return
      }

      setFetchState((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) => (item.id === result.user.id ? result.user : item)),
            }
          : current,
      )
      setDraftRoles((current) => ({ ...current, [result.user.id]: result.user.role }))
      setActionStatus(
        `Perfil de ${result.user.name} atualizado para ${ROLE_LABELS[result.user.role]}.`,
      )
    } catch {
      if (!controller.signal.aborted) {
        setActionError('Não foi possível salvar o novo perfil agora.')
      }
    } finally {
      updateReqRef.current = null
      if (!controller.signal.aborted) setSavingUserId(null)
    }
  }

  return (
    <section className="profile-card" aria-labelledby="admin-users-heading">
      <div className="profile-card-header">
        <h2 id="admin-users-heading">
          <UsersIcon width={18} height={18} variant="gradient" />
          Gestão de Contas e Permissões
        </h2>
        <span className="role-badge">Somente Admin</span>
      </div>

      <p className="profile-magic-note">
        <ShieldCheckIcon width={16} height={16} variant="gradient" />
        <span>
          Defina quem atua como <strong>Comprador</strong>, <strong>Organizador</strong>,{' '}
          <strong>Equipe de Check-in (Staff)</strong> ou <strong>Administrador</strong>. Novos
          cadastros públicos iniciam sempre como Comprador.
        </span>
      </p>

      <form className="admin-users-filters" onSubmit={handleSearchSubmit}>
        <label className="admin-filter-search">
          Buscar por nome ou e-mail
          <input
            type="search"
            value={searchInput}
            placeholder="nome@exemplo.com"
            onChange={(e) => setSearchInput(e.currentTarget.value)}
          />
        </label>
        <label>
          Filtrar perfil
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.currentTarget.value)
              setActionStatus('')
              setActionError('')
            }}
          >
            <option value="">Todos os perfis</option>
            {ALL_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]} ({role})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm admin-filter-btn">
          Buscar
        </button>
      </form>

      {actionError && <p className="form-alert" role="alert">{actionError}</p>}
      {actionStatus && <p className="form-status" role="status">{actionStatus}</p>}

      {loading ? (
        <p className="event-meta" role="status">Carregando contas cadastradas…</p>
      ) : loadError ? (
        <div className="state-banner state-error">
          <p role="alert">{loadError}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setReloadTick((prev) => prev + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : users.length === 0 ? (
        <p className="event-meta">Nenhuma conta encontrada para este filtro.</p>
      ) : (
        <ul className="admin-users-list">
          {users.map((item) => {
            const selectedRole = draftRoles[item.id] ?? item.role
            const isSelf = item.id === currentUserId
            const busy = savingUserId === item.id

            return (
              <li key={item.id} className="admin-user-row">
                <div className="admin-user-info">
                  <strong>{item.name}</strong>
                  <span className="admin-user-email">{item.email}</span>
                  <span className="role-badge">{ROLE_LABELS[item.role]} · {item.role}</span>
                </div>

                {isSelf ? (
                  <span className="admin-self-tag">Sua conta atual</span>
                ) : (
                  <div className="admin-user-controls">
                    <select
                      aria-label={`Perfil de ${item.email}`}
                      value={selectedRole}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.currentTarget.value as UserRole
                        setDraftRoles((current) => ({ ...current, [item.id]: next }))
                      }}
                    >
                      {ALL_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]} ({role})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy || selectedRole === item.role}
                      onClick={() => void handleSaveRole(item)}
                    >
                      {busy ? 'Salvando…' : 'Salvar perfil'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function ProfilePage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionTokenKey))
  const [attempt, setAttempt] = useState(0)
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [resolvedKey, setResolvedKey] = useState('')
  const [loadError, setLoadError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [avatarImage, setAvatarImage] = useState<string | null>(null)

  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileStatus, setProfileStatus] = useState('')
  const [profileError, setProfileError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const profileReqRef = useRef<AbortController | null>(null)
  const passwordReqRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      profileReqRef.current?.abort()
      passwordReqRef.current?.abort()
    }
  }, [])

  const requestKey = token ? `${token}:${attempt}` : ''
  const loading = Boolean(token && resolvedKey !== requestKey)

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()

    getCurrentUser(token, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return
        if (!loaded) {
          sessionStorage.removeItem(sessionTokenKey)
          setToken(null)
          setProfile(null)
          notifyUserUpdated(null)
          return
        }
        setLoadError('')
        setProfile(loaded)
        setName(loaded.name)
        setEmail(loaded.email)
        setPhone(loaded.phone ?? '')
        setCity(loaded.city ?? '')
        setBio(loaded.bio ?? '')
        setAvatarImage(loaded.avatarImage ?? null)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError('Não foi possível carregar os dados do perfil. Tente novamente.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolvedKey(requestKey)
      })

    return () => controller.abort()
  }, [requestKey, token])

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setAvatarError('')
    setProfileStatus('')
    setAvatarProcessing(true)
    try {
      const encoded = await prepareAvatarUpload(file)
      setAvatarImage(encoded)
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Não foi possível processar a foto.')
    } finally {
      setAvatarProcessing(false)
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || profileReqRef.current) return

    const controller = new AbortController()
    profileReqRef.current = controller
    setSavingProfile(true)
    setProfileStatus('')
    setProfileError('')

    try {
      const updated = await updateProfile(
        token,
        {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          city: city.trim() || null,
          bio: bio.trim() || null,
          avatarImage,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return

      if (!updated) {
        sessionStorage.removeItem(sessionTokenKey)
        setToken(null)
        setProfile(null)
        notifyUserUpdated(null)
        return
      }

      setProfile(updated)
      setName(updated.name)
      setEmail(updated.email)
      setPhone(updated.phone ?? '')
      setCity(updated.city ?? '')
      setBio(updated.bio ?? '')
      setAvatarImage(updated.avatarImage ?? null)
      notifyUserUpdated(updated)
      setProfileStatus('Cadastro e perfil atualizados com sucesso.')
    } catch (error) {
      if (controller.signal.aborted) return
      setProfileError(error instanceof Error ? error.message : 'Não foi possível atualizar seu perfil.')
    } finally {
      profileReqRef.current = null
      if (!controller.signal.aborted) setSavingProfile(false)
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || passwordReqRef.current) return

    setPasswordStatus('')
    setPasswordError('')

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.')
      return
    }

    const controller = new AbortController()
    passwordReqRef.current = controller
    setSavingPassword(true)

    try {
      const result = await changePassword(
        token,
        { currentPassword, newPassword },
        controller.signal,
      )
      if (controller.signal.aborted) return

      if (!result.ok) {
        if (result.expired) {
          sessionStorage.removeItem(sessionTokenKey)
          setToken(null)
          setProfile(null)
          notifyUserUpdated(null)
          return
        }
        setPasswordError(result.message)
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordStatus('Senha alterada com sucesso.')
    } catch {
      if (!controller.signal.aborted) {
        setPasswordError('Não foi possível alterar a senha agora.')
      }
    } finally {
      passwordReqRef.current = null
      if (!controller.signal.aborted) setSavingPassword(false)
    }
  }

  const avatarChanged = (profile?.avatarImage ?? null) !== avatarImage
  const monogram = (name || profile?.name || 'C').trim().charAt(0).toUpperCase() || 'C'

  const expireSession = useCallback(() => {
    sessionStorage.removeItem(sessionTokenKey)
    setToken(null)
    setProfile(null)
    notifyUserUpdated(null)
  }, [])

  return (
    <AppLayout>
      <main className="catalog">
        <div className="page-header">
          <div className="profile-header-stack">
            <Link to="/" className="back-link">
              <ArrowLeftIcon width={15} height={15} />
              Voltar aos eventos
            </Link>
            <span className="eyebrow">Conta ColaAí</span>
            <h1>Meu Perfil</h1>
            <p className="lead-text">Gerencie seus dados pessoais, foto de exibição e segurança da conta.</p>
          </div>
        </div>

        {!token ? (
          <div className="state-banner">
            <p>Entre na sua conta para visualizar e editar o seu perfil.</p>
            <Link to="/login" className="btn btn-primary">Entrar</Link>
          </div>
        ) : loading ? (
          <div className="state-banner" role="status">
            <p>Carregando dados do perfil…</p>
          </div>
        ) : loadError ? (
          <div className="state-banner" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setLoadError('')
                setToken(sessionStorage.getItem(sessionTokenKey))
                setAttempt((prev) => prev + 1)
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : profile && (
          <div className="profile-grid">
            <section className="profile-card profile-identity-card" aria-label="Resumo da conta">
              <div className="profile-avatar-ring">
                <div className="profile-avatar-inner">
                  {avatarImage ? (
                    <img src={avatarImage} alt={`Foto de ${name || profile.name}`} className="profile-avatar-photo" />
                  ) : (
                    <span className="profile-avatar-monogram" aria-hidden="true">{monogram}</span>
                  )}
                </div>
              </div>

              <div className="profile-identity-meta">
                <h2>{name || profile.name}</h2>
                <p className="profile-identity-email">{email || profile.email}</p>
                <span className="role-badge">{ROLE_LABELS[profile.role]} · {profile.role}</span>
                {profile.createdAt && (
                  <p className="profile-member-since">
                    Membro desde {formatMemberSince.format(new Date(profile.createdAt))}
                  </p>
                )}
              </div>

              <div className="profile-permissions">
                <h3>Permissões da sua conta</h3>
                <ul>
                  {ROLE_PERMISSIONS[profile.role].map((permission) => (
                    <li key={permission}>{permission}</li>
                  ))}
                </ul>
              </div>

              <div className="profile-avatar-actions">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only-input"
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm profile-upload-trigger"
                  disabled={avatarProcessing || savingProfile}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <UploadIcon width={15} height={15} />
                  {avatarProcessing ? 'Otimizando…' : avatarImage ? 'Trocar foto' : 'Enviar foto'}
                </button>
                {avatarImage && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={avatarProcessing || savingProfile}
                    onClick={() => {
                      setAvatarImage(null)
                      setAvatarError('')
                    }}
                  >
                    <CloseIcon width={14} height={14} />
                    Remover foto
                  </button>
                )}
              </div>

              {avatarError && <p className="form-alert" role="alert">{avatarError}</p>}
              <p className="profile-upload-hint">
                PNG, JPEG ou WebP. Recorte quadrado automático em alta nitidez.
                {avatarChanged && ' Clique em Salvar alterações para aplicar a foto.'}
              </p>

              <div className="profile-shortcuts">
                {canAccessBuyerTickets(profile.role) && (
                  <Link to="/meus-ingressos" className="btn btn-ghost btn-sm btn-full">Meus Ingressos</Link>
                )}
                {canAccessPanel(profile.role) && (
                  <Link to="/painel" className="btn btn-ghost btn-sm btn-full">Painel do organizador</Link>
                )}
                {canAccessCheckin(profile.role) && (
                  <Link to="/check-in" className="btn btn-ghost btn-sm btn-full">Check-in de portaria</Link>
                )}
              </div>
            </section>

            <div className="profile-forms-stack">
              <section className="profile-card" aria-labelledby="profile-data-heading">
                <div className="profile-card-header">
                  <h2 id="profile-data-heading">
                    <UserIcon width={18} height={18} variant="gradient" />
                    Dados cadastrais
                  </h2>
                </div>

                <form className="auth-form profile-form" onSubmit={handleProfileSubmit}>
                  <div className="profile-form-row">
                    <label>
                      Nome completo
                      <input
                        name="name"
                        type="text"
                        minLength={2}
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        required
                      />
                    </label>
                    <label>
                      E-mail
                      <input
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.currentTarget.value)}
                        required
                      />
                    </label>
                  </div>

                  <div className="profile-form-row">
                    <label>
                      Telefone / WhatsApp
                      <input
                        name="phone"
                        type="tel"
                        maxLength={30}
                        placeholder="(85) 99999-0000"
                        value={phone}
                        onChange={(e) => setPhone(e.currentTarget.value)}
                      />
                    </label>
                    <label>
                      Cidade / UF
                      <input
                        name="city"
                        type="text"
                        maxLength={100}
                        placeholder="Fortaleza, CE"
                        value={city}
                        onChange={(e) => setCity(e.currentTarget.value)}
                      />
                    </label>
                  </div>

                  <label>
                    Sobre você
                    <textarea
                      name="bio"
                      rows={3}
                      maxLength={280}
                      placeholder="Conte um pouco sobre os eventos que você curte ou organiza…"
                      value={bio}
                      onChange={(e) => setBio(e.currentTarget.value)}
                    />
                    <span className="profile-char-count">{bio.length}/280</span>
                  </label>

                  {profileError && <p className="form-alert" role="alert">{profileError}</p>}
                  {profileStatus && <p className="form-status" role="status">{profileStatus}</p>}

                  <div>
                    <button type="submit" className="btn btn-primary" disabled={savingProfile || avatarProcessing}>
                      {savingProfile ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="profile-card" aria-labelledby="profile-security-heading">
                <div className="profile-card-header">
                  <h2 id="profile-security-heading">
                    <LockIcon width={18} height={18} variant="gradient" />
                    Segurança e acesso
                  </h2>
                </div>

                <p className="profile-magic-note">
                  <MailIcon width={16} height={16} variant="gradient" />
                  <span>
                    O login sem senha via <strong>Link Mágico</strong> envia o acesso diretamente para o e-mail principal{' '}
                    <strong>{profile.email}</strong>.
                  </span>
                </p>

                <form className="auth-form profile-form" onSubmit={handlePasswordSubmit}>
                  <label>
                    Senha atual
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                      required
                    />
                  </label>

                  <div className="profile-form-row">
                    <label>
                      Nova senha
                      <input
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.currentTarget.value)}
                        required
                      />
                    </label>
                    <label>
                      Confirmar nova senha
                      <input
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                        required
                      />
                    </label>
                  </div>

                  {passwordError && <p className="form-alert" role="alert">{passwordError}</p>}
                  {passwordStatus && <p className="form-status" role="status">{passwordStatus}</p>}

                  <div>
                    <button type="submit" className="btn btn-secondary" disabled={savingPassword}>
                      {savingPassword ? 'Atualizando senha…' : 'Alterar senha'}
                    </button>
                  </div>
                </form>
              </section>

              {isAdminRole(profile.role) && token && (
                <AdminUsersSection
                  token={token}
                  currentUserId={profile.id}
                  onSessionExpired={expireSession}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  )
}
