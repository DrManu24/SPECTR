import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

function Header({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  const showAdminNav =
    location.pathname === '/admin/home' ||
    location.pathname === '/admin/audit-logs' ||
    /^\/admin\/organizers\/\d+$/.test(location.pathname)

  return (
    <header className="app-header">
      <div className="app-header__top">
        <NavLink to="/" className="site-name" onClick={closeMenu}>
          <img
            src="/spectr-logo.svg"
            alt=""
            className="site-name__logo"
            width={44}
            height={59}
          />
          <span className="site-name__text">
            <span className="site-name__brand">SPECTR</span>
            <span className="site-name__tagline">
              <span className="site-name__by">by</span>
              <span className="site-name__org">MMMR</span>
            </span>
          </span>
        </NavLink>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="nav-toggle__bars" aria-hidden="true">
            <span className="nav-toggle__bar" />
            <span className="nav-toggle__bar" />
            <span className="nav-toggle__bar" />
          </span>
          <span className="visually-hidden">{menuOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
      <div
        className={`app-header__panel${menuOpen ? ' app-header__panel--open' : ''}`}
      >
        <nav id="app-nav-menu" className="nav-menu">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            Home
          </NavLink>
          <NavLink
            to="/organizer"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            Central Trial Coordinator (CTC)
          </NavLink>
          <NavLink
            to="/investigator"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            Study Investigator (SI)
          </NavLink>
          {showAdminNav && (
            <NavLink
              to="/admin/home"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={closeMenu}
            >
              Admin
            </NavLink>
          )}
        </nav>
        {children ? <div className="header-actions">{children}</div> : null}
      </div>
    </header>
  )
}

export default Header
