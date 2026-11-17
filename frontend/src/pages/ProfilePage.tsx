import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  canAccessPanel,
  changePassword,
  getCurrentUser,
  notifyUserUpdated,
  sessionTokenKey,
  updateProfile,
  type AuthUser,
} from '../api'
import AppLayout from '../components/AppLayout'
import {
  ArrowLeftIcon,
  CloseIcon,
  LockIcon,
  MailIcon,
  UploadIcon,
  UserIcon,
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
                <span className="role-badge">{profile.role}</span>
                {profile.createdAt && (
                  <p className="profile-member-since">
                    Membro desde {formatMemberSince.format(new Date(profile.createdAt))}
                  </p>
                )}
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
                <Link to="/meus-ingressos" className="btn btn-ghost btn-sm btn-full">Meus Ingressos</Link>
                {canAccessPanel(profile.role) && (
                  <Link to="/painel" className="btn btn-ghost btn-sm btn-full">Painel do organizador</Link>
                )}
                {profile.role === 'STAFF' && (
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
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  )
}
