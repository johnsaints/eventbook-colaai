import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import logoWordmark from '../assets/ColaAi_wordmark_aprovado_transparente.webp'
import { canAccessPanel, getCurrentUser, sessionTokenKey, type AuthUser } from '../api'

export default function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [hasToken, setHasToken] = useState(() => Boolean(sessionStorage.getItem(sessionTokenKey)))

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
          </Link>

          <nav className="nav-links" aria-label="Navegação principal">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Eventos
            </NavLink>
            <NavLink to="/meus-ingressos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Meus Ingressos
            </NavLink>
            {(!user || canAccessPanel(user.role)) && (
              <NavLink to="/painel" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Painel
              </NavLink>
            )}
            {(!user || user.role === 'STAFF') && (
              <NavLink to="/check-in" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Check-in
              </NavLink>
            )}
          </nav>

          <div className="nav-auth">
            {user ? (
              <>
                <span className="user-pill">
                  <span className="user-name">{user.name}</span>
                  <span className="role-badge">{user.role}</span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  Sair
                </button>
              </>
            ) : hasToken ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                Sair
              </button>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Entrar</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Criar conta</Link>
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
