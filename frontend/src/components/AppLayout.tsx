import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import logoWordmark from '../assets/ColaAi_wordmark_aprovado_transparente.webp'
import {
  canAccessBuyerTickets,
  canAccessCheckin,
  canAccessPanel,
  clearSession,
  getCurrentUser,
  getSessionToken,
  getStoredSessionUser,
  ROLE_LABELS,
  sessionTokenKey,
  sessionUserKey,
  userUpdatedEventName,
  type AuthUser,
} from '../api'
import { showToast } from '../toast'
import Drawer from './Drawer'
import { ArrowRightIcon, BrandGridIcon, ChartIcon, LogoutIcon, MenuIcon, QrCodeIcon, TicketIcon } from './Icons'

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(() => getStoredSessionUser())
  const [hasToken, setHasToken] = useState(() => Boolean(getSessionToken()))
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    function handleUserUpdated(event: Event) {
      const updated = (event as CustomEvent<AuthUser | null>).detail
      setUser(updated)
      setHasToken(Boolean(getSessionToken()))
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key !== null && event.key !== sessionTokenKey && event.key !== sessionUserKey) {
        return
      }
      setUser(getStoredSessionUser())
      setHasToken(Boolean(getSessionToken()))
    }

    window.addEventListener(userUpdatedEventName, handleUserUpdated)
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener(userUpdatedEventName, handleUserUpdated)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  useEffect(() => {
    const token = getSessionToken()
    if (!token) return

    const controller = new AbortController()
    getCurrentUser(token, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return
        if (!loaded) {
          clearSession(token)
          setHasToken(false)
          setUser(null)
          return
        }
        setUser(loaded)
      })
      .catch(() => {
        // Mantem a identidade provisoria derivada do JWT caso a API esteja indisponivel
      })

    return () => controller.abort()
  }, [])

  function handleLogout() {
    setMobileMenuOpen(false)
    clearSession()
    setHasToken(false)
    setUser(null)
    showToast({
      message: 'Logout realizado com sucesso.',
      tone: 'success',
    })
    void navigate('/', { replace: true })
  }

  const isStaff = user?.role === 'STAFF'

  const navItems = [
    { to: '/', end: true, label: 'Eventos', Icon: BrandGridIcon, visible: !isStaff },
    {
      to: '/meus-ingressos',
      end: false,
      label: 'Meus Ingressos',
      Icon: TicketIcon,
      visible: Boolean(user && canAccessBuyerTickets(user.role)),
    },
    {
      to: '/painel',
      end: false,
      label: 'Painel',
      Icon: ChartIcon,
      visible: Boolean(user && canAccessPanel(user.role)),
    },
    {
      to: '/check-in',
      end: false,
      label: 'Check-in',
      Icon: QrCodeIcon,
      visible: Boolean(user && canAccessCheckin(user.role)),
    },
  ].filter((item) => item.visible)

  return (
    <div className="app-shell">
      <header className="navbar">
        <div className="navbar-inner">
          <Link
            to={isStaff ? '/check-in' : '/'}
            className="brand-link"
            aria-label={isStaff ? 'ColaAí — Check-in' : 'ColaAí — Página inicial'}
          >
            <img src={logoWordmark} alt="ColaAí" className="brand-wordmark" />
            <span className="brand-subline">
              <span className="brand-subline-rule" aria-hidden="true" />
              <span className="brand-subtext">Eventos</span>
              <span className="brand-subline-rule" aria-hidden="true" />
            </span>
          </Link>

          <nav className="nav-links" aria-label="Navegação principal">
            {navItems.map(({ to, end, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                {({ isActive }) => (
                  <>
                    <Icon width={15} height={15} variant={isActive ? 'gradient' : 'current'} className="nav-link-icon" />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
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

          <button
            type="button"
            className="nav-menu-trigger"
            aria-label="Abrir menu de navegação"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <MenuIcon width={19} height={19} />
            <span>Menu</span>
          </button>
        </div>
      </header>

      <Drawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        side="left"
        size="sm"
        title="Menu"
        footer={user || hasToken ? (
          <button type="button" className="btn btn-secondary btn-full" onClick={handleLogout}>
            <LogoutIcon width={15} height={15} />
            <span>Sair da conta</span>
          </button>
        ) : (
          <div className="mobile-drawer-auth-actions">
            <Link to="/login" className="btn btn-secondary btn-full" onClick={() => setMobileMenuOpen(false)}>
              Entrar
            </Link>
            <Link to="/register" className="btn btn-primary btn-full" onClick={() => setMobileMenuOpen(false)}>
              Criar conta
            </Link>
          </div>
        )}
      >
        {(user || hasToken) && (
          <NavLink
            to="/perfil"
            className={({ isActive }) => isActive ? 'mobile-drawer-user active' : 'mobile-drawer-user'}
            onClick={() => setMobileMenuOpen(false)}
            title="Meu perfil"
          >
            <span className="user-avatar" aria-hidden="true">
              {user?.avatarImage ? (
                <img src={user.avatarImage} alt="" className="user-avatar-img" />
              ) : (
                user?.name.trim().charAt(0).toUpperCase() || 'C'
              )}
            </span>
            <div className="mobile-drawer-user-meta">
              <strong>{user ? user.name : 'Meu Perfil'}</strong>
              {user?.email && <span>{user.email}</span>}
              {user && <span className="role-badge">{ROLE_LABELS[user.role]}</span>}
            </div>
            <ArrowRightIcon width={15} height={15} className="mobile-drawer-user-arrow" />
          </NavLink>
        )}

        <nav className="mobile-drawer-nav" aria-label="Menu móvel">
          {navItems.map(({ to, end, label, Icon }) => (
            <NavLink
              key={`mobile-${to}`}
              to={to}
              end={end}
              className={({ isActive }) => isActive ? 'mobile-drawer-link active' : 'mobile-drawer-link'}
              onClick={() => setMobileMenuOpen(false)}
            >
              {({ isActive }) => (
                <>
                  <Icon width={17} height={17} variant={isActive ? 'gradient' : 'current'} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </Drawer>

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
