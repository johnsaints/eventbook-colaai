import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import logoWordmark from '../assets/ColaAi_wordmark_aprovado_transparente.webp'
import {
  canAccessPanel,
  getCurrentUser,
  sessionTokenKey,
  userUpdatedEventName,
  type AuthUser,
} from '../api'
import { BrandGridIcon, ChartIcon, LogoutIcon, QrCodeIcon, TicketIcon } from './Icons'

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [hasToken, setHasToken] = useState(() => Boolean(sessionStorage.getItem(sessionTokenKey)))

  useEffect(() => {
    function handleUserUpdated(event: Event) {
      const updated = (event as CustomEvent<AuthUser | null>).detail
      setUser(updated)
      setHasToken(Boolean(sessionStorage.getItem(sessionTokenKey)))
    }

    window.addEventListener(userUpdatedEventName, handleUserUpdated)
    return () => window.removeEventListener(userUpdatedEventName, handleUserUpdated)
  }, [])

  useEffect(() => {
    const token = sessionStorage.getItem(sessionTokenKey)
    if (!token) return

    const controller = new AbortController()
    getCurrentUser(token, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return
        if (!loaded) {
          sessionStorage.removeItem(sessionTokenKey)
          setHasToken(false)
          setUser(null)
          return
        }
        setUser(loaded)
      })
      .catch(() => {
        if (!controller.signal.aborted) setUser(null)
      })

    return () => controller.abort()
  }, [])

  function handleLogout() {
    sessionStorage.removeItem(sessionTokenKey)
    setHasToken(false)
    setUser(null)
    void navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="brand-link" aria-label="ColaAí — Página inicial">
            <img src={logoWordmark} alt="ColaAí" className="brand-wordmark" />
            <span className="brand-subline">
              <span className="brand-subline-rule" aria-hidden="true" />
              <span className="brand-subtext">Eventos</span>
              <span className="brand-subline-rule" aria-hidden="true" />
            </span>
          </Link>

          <nav className="nav-links" aria-label="Navegação principal">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {({ isActive }) => (
                <>
                  <BrandGridIcon width={15} height={15} variant={isActive ? 'gradient' : 'current'} className="nav-link-icon" />
                  <span>Eventos</span>
                </>
              )}
            </NavLink>
            <NavLink to="/meus-ingressos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {({ isActive }) => (
                <>
                  <TicketIcon width={15} height={15} variant={isActive ? 'gradient' : 'current'} className="nav-link-icon" />
                  <span>Meus Ingressos</span>
                </>
              )}
            </NavLink>
            {(!user || canAccessPanel(user.role)) && (
              <NavLink to="/painel" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {({ isActive }) => (
                  <>
                    <ChartIcon width={15} height={15} variant={isActive ? 'gradient' : 'current'} className="nav-link-icon" />
                    <span>Painel</span>
                  </>
                )}
              </NavLink>
            )}
            {(!user || user.role === 'STAFF') && (
              <NavLink to="/check-in" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {({ isActive }) => (
                  <>
                    <QrCodeIcon width={15} height={15} variant={isActive ? 'gradient' : 'current'} className="nav-link-icon" />
                    <span>Check-in</span>
                  </>
                )}
              </NavLink>
            )}
          </nav>

          <div className="nav-auth">
            {user ? (
              <>
                <NavLink
                  to="/perfil"
                  className={({ isActive }) =>
                    isActive ? 'user-pill user-pill-link active' : 'user-pill user-pill-link'
                  }
                  title="Meu perfil"
                >
                  <span className="user-avatar" aria-hidden="true">
                    {user.avatarImage ? (
                      <img src={user.avatarImage} alt="" className="user-avatar-img" />
                    ) : (
                      user.name.trim().charAt(0).toUpperCase() || 'C'
                    )}
                  </span>
                  <span className="user-name">{user.name}</span>
                </NavLink>
                <button type="button" className="btn nav-logout-btn" onClick={handleLogout}>
                  <LogoutIcon width={15} height={15} />
                  <span>Sair</span>
                </button>
              </>
            ) : hasToken ? (
              <>
                <NavLink
                  to="/perfil"
                  className={({ isActive }) =>
                    isActive ? 'user-pill user-pill-link active' : 'user-pill user-pill-link'
                  }
                >
                  <span className="user-name">Meu Perfil</span>
                </NavLink>
                <button type="button" className="btn nav-logout-btn" onClick={handleLogout}>
                  <LogoutIcon width={15} height={15} />
                  <span>Sair</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn nav-login-btn">Entrar</Link>
                <Link to="/register" className="btn btn-primary nav-register-btn">Criar conta</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="app-content">{children}</div>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>
            <strong>ColaAí</strong> · Ingressos e Acessos para Eventos
          </span>
          <span className="footer-note">
            Projeto Final Full Cycle · EventBook Platform
          </span>
        </div>
      </footer>
    </div>
  )
}
