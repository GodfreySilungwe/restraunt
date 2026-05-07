import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import Menu from './components/Menu'
import Home from './components/Home'
import ItemDetail from './components/ItemDetail'
import Cart from './components/Cart'
import About from './components/About'
import Reservation from './components/Reservation'
import NewsletterSignup from './components/NewsletterSignup'
import Gallery from './components/Gallery'
// lazy-load admin dashboard
const AdminDashboardLazy = React.lazy(() => import('./components/AdminDashboard'))
import { CartProvider, useCart } from './context/CartContext'
import { apiFetch } from './utils/api'

function HeaderBar({ searchQuery, onSearchChange }) {
  const { items } = useCart()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginPassword, setLoginPassword] = useState('')
  const [adminLoggedIn, setAdminLoggedIn] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const location = useLocation()
  const moreMenuRef = useRef(null)
  
  const total = items.reduce((s, i) => s + (i.qty || 0), 0)
  const badgeStyle = {
    display: 'inline-block',
    minWidth: 20,
    padding: '2px 6px',
    borderRadius: 12,
    background: '#ff6b6b',
    color: 'white',
    fontSize: 12,
    marginLeft: 6,
    WebkitTextFillColor: 'white',
    textFillColor: 'white'
  }

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleSearchChange = (e) => {
    onSearchChange(e.target.value)
    if (e.target.value && window.location.pathname !== '/menu' && window.location.pathname !== '/') {
      navigate('/menu')
    }
  }

  useEffect(() => {
    if (!moreMenuOpen) return undefined

    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setMoreMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [moreMenuOpen])

  useEffect(() => {
    if (moreMenuOpen) {
      setMoreMenuOpen(false)
    }
  }, [location.pathname])

  const handleLoginSubmit = (e) => {
    e.preventDefault()
    // Check for admin password - you can change this to match your backend
    if (loginPassword === 'admin123') {
      setAdminLoggedIn(true)
      setLoginModalOpen(false)
      navigate('/admin')
    } else {
      alert('Invalid password. Please try again.')
    }
    setLoginPassword('')
  }

  const isSmallPhone = windowWidth < 768
  const isTablet = windowWidth >= 768 && windowWidth < 1280
  const isDesktop = windowWidth >= 1280

  // Render appropriate header based on screen size
  if (isSmallPhone) {
    // Small phone layout: Home | Menu | Cart | Drop down in a row
    return (
      <>
        <header className="app-header app-header-mobile">
          <NavLink to="/" className="nav-icon-btn" title="Home">
            🏠
          </NavLink>

          <NavLink to="/menu" className="nav-icon-btn" title="Menu">
            🍽️
          </NavLink>

          <NavLink to="/cart" className="nav-icon-btn" title="Cart">
            🛒 {total > 0 && <span style={badgeStyle}>{total}</span>}
          </NavLink>

          <div className="more-menu-container" ref={moreMenuRef}>
            <button
              type="button"
              className="more-menu-btn"
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              title="More"
            >
              ☰
            </button>
            {moreMenuOpen && (
              <nav className="more-menu-dropdown">
                <NavLink 
                  to="/menu" 
                  onClick={() => setMoreMenuOpen(false)}
                  className={({ isActive }) => `more-menu-link${isActive ? ' active' : ''}`}
                >
                  Menu
                </NavLink>
                <NavLink 
                  to="/reserve" 
                  onClick={() => setMoreMenuOpen(false)}
                  className={({ isActive }) => `more-menu-link${isActive ? ' active' : ''}`}
                >
                  Reservation
                </NavLink>
                <NavLink 
                  to="/gallery" 
                  onClick={() => setMoreMenuOpen(false)}
                  className={({ isActive }) => `more-menu-link${isActive ? ' active' : ''}`}
                >
                  Gallery
                </NavLink>
                <NavLink 
                  to="/about" 
                  onClick={() => setMoreMenuOpen(false)}
                  className={({ isActive }) => `more-menu-link${isActive ? ' active' : ''}`}
                >
                  About
                </NavLink>
                <button
                  type="button"
                  className="more-menu-link login-link"
                  onClick={() => {
                    setLoginModalOpen(true)
                    setMoreMenuOpen(false)
                  }}
                >
                  {adminLoggedIn ? 'Admin' : 'Login'}
                </button>
              </nav>
            )}
          </div>
        </header>

        {loginModalOpen && (
          <div className="login-modal-overlay" onClick={() => setLoginModalOpen(false)}>
            <div className="login-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Admin Login</h2>
              <form onSubmit={handleLoginSubmit}>
                <input
                  type="password"
                  placeholder="Enter admin password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary">Login</button>
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(false)}
                  className="btn btn-tertiary"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </>
    )
  }

  if (isTablet) {
    // Tablet layout: Home | Menu | Cart | Reservation | Gallery (no dropdown, no search, no login)
    return (
      <>
        <header className="app-header-tablet">
          <NavLink to="/" className="tablet-nav-btn" title="Home">
            🏠
          </NavLink>

          <NavLink to="/menu" className="tablet-nav-btn" title="Menu">
            🍽️
          </NavLink>

          <NavLink to="/cart" className="tablet-nav-btn" title="Cart">
            🛒 {total > 0 && <span style={badgeStyle}>{total}</span>}
          </NavLink>

          <NavLink to="/reserve" className="tablet-nav-btn" title="Reservation">
            📅
          </NavLink>

          <NavLink to="/gallery" className="tablet-nav-btn" title="Gallery">
            🖼️
          </NavLink>
        </header>

        {loginModalOpen && (
          <div className="login-modal-overlay" onClick={() => setLoginModalOpen(false)}>
            <div className="login-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Admin Login</h2>
              <form onSubmit={handleLoginSubmit}>
                <input
                  type="password"
                  placeholder="Enter admin password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary">Login</button>
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(false)}
                  className="btn btn-tertiary"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        )}
      </>
    )
  }

  // Desktop layout: Full responsive with autoscaling
  return (
    <>
      <header className="app-header app-header-desktop">
        <div className="header-left">
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
            <NavLink onClick={() => setMenuOpen(false)} to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>🏠</NavLink>
            <NavLink onClick={() => setMenuOpen(false)} to="/menu" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Menu</NavLink>
            <NavLink onClick={() => setMenuOpen(false)} to="/cart" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              🛒{total > 0 && <span style={badgeStyle}>{total}</span>}
            </NavLink>
            <NavLink onClick={() => setMenuOpen(false)} to="/reserve" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Reservation</NavLink>
            <NavLink onClick={() => setMenuOpen(false)} to="/gallery" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Gallery</NavLink>
            <NavLink onClick={() => setMenuOpen(false)} to="/about" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>About Us</NavLink>
          </nav>
        </div>

        <div className="header-center">
          <div className="header-brand">GOSH CAFE</div>
        </div>

        <div className="header-right">
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="search-input"
          />
          <button
            type="button"
            className="login-btn"
            onClick={() => setLoginModalOpen(true)}
          >
            {adminLoggedIn ? '👤 Admin' : '🔐 Login'}
          </button>
        </div>
      </header>

      {loginModalOpen && (
        <div className="login-modal-overlay" onClick={() => setLoginModalOpen(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Admin Login</h2>
            <form onSubmit={handleLoginSubmit}>
              <input
                type="password"
                placeholder="Enter admin password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary">Login</button>
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="btn btn-tertiary"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    apiFetch('menu')
      .then((r) => r.json())
      .then((data) => {
        // new /api/menu returns { categories: [...], promotions: [...] }
        const cats = Array.isArray(data) ? data : (data.categories || [])
        setCategories(cats)
      })
      .catch((err) => console.error('Failed to load menu:', err))
  }, [])

  return (
    <CartProvider>
      <HeaderBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Menu categories={categories} searchQuery={searchQuery} onSearchChange={setSearchQuery} />} />
          <Route path="/about" element={<About />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/reserve" element={<Reservation />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route
            path="/admin"
            element={
              // lazy import AdminDashboard to avoid loading admin code in normal user flows
              <React.Suspense fallback={<div>Loading admin…</div>}>
                <AdminDashboardLazy />
              </React.Suspense>
            }
          />
        </Routes>
      </main>
    </CartProvider>
  )
}

export default App

