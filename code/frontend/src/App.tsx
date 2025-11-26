import React, { useState, useEffect } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import MapView from './pages/MapView'
import Places from './pages/Places'
import PlaceDetail from './pages/PlaceDetail'
import AdminDashboard from './pages/AdminDashboard'
import { authAPI } from './services/api'
import type { UserRole } from './types/models'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(authAPI.isAuthenticated())
  const [userRole, setUserRole] = useState<UserRole | null>(authAPI.getCurrentUserRole())
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setIsAuthenticated(authAPI.isAuthenticated())
    setUserRole(authAPI.getCurrentUserRole())
  }, [location])

  const handleSignOut = () => {
    authAPI.signOut()
    setIsAuthenticated(false)
    setUserRole(null)
    navigate('/login')
  }

  const handleLogin = () => {
    setIsAuthenticated(true)
    setUserRole(authAPI.getCurrentUserRole())
  }

  return (
    <div className="min-h-screen bg-topo-cream relative">
      {/* Background pattern */}
      <div className="fixed inset-0 grid-pattern pointer-events-none" />
      
      {/* Header */}
      <header className="relative border-b-4 border-topo-brown bg-topo-cream">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="group">
              <h1 className="text-display text-5xl font-black tracking-tight text-topo-brown">
                ORBIS
              </h1>
              <p className="text-mono text-xs uppercase tracking-widest text-contour mt-1">
                Fictional World Navigation
              </p>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  <NavLink to="/">Home</NavLink>
                  <NavLink to="/map">Map</NavLink>
                  <NavLink to="/places">Locations</NavLink>
                  {userRole === 'admin' && <NavLink to="/admin">Admin</NavLink>}
                  <button
                    onClick={handleSignOut}
                    className="btn btn-secondary text-xs"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/">Home</NavLink>
                  <Link to="/login" className="btn btn-primary text-xs">
                    Sign In
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>

        {/* Coordinate decoration */}
        <div className="absolute top-2 right-6 text-mono text-xs text-contour opacity-50">
          [{new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}]
        </div>
      </header>

      {/* Main content */}
      <main className="relative max-w-7xl mx-auto px-6 py-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/map" element={isAuthenticated ? <MapView /> : <Login onLogin={handleLogin} />} />
          <Route path="/places" element={isAuthenticated ? <Places /> : <Login onLogin={handleLogin} />} />
          <Route path="/places/:id" element={isAuthenticated ? <PlaceDetail /> : <Login onLogin={handleLogin} />} />
          <Route
            path="/admin"
            element={isAuthenticated
              ? userRole === 'admin'
                ? <AdminDashboard />
                : <AccessDenied />
              : <Login onLogin={handleLogin} />}
          />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="relative border-t-4 border-topo-brown mt-24 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center text-xs text-mono text-contour">
            <div>
              <p>CPSC 471 · Fall 2025 · T03-7</p>
              <p className="mt-1">University of Calgary</p>
            </div>
            <div className="text-right">
              <p>Yahya Asmara · Abdulrahman Negmeldin · Jason Duong</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Navigation link component
function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`
        text-mono text-sm font-bold uppercase tracking-wider px-4 py-2
        border-4 transition-all duration-100
        ${isActive 
          ? 'border-topo-brown bg-topo-green text-topo-cream' 
          : 'border-transparent hover:border-topo-brown'
        }
      `}
    >
      {children}
    </Link>
  )
}

function AccessDenied() {
  return (
    <div className="card p-12 text-center">
      <p className="text-mono text-2xs uppercase tracking-widest text-contour mb-4">Restricted</p>
      <h2 className="text-display text-4xl font-black text-topo-brown mb-4">Admin access required</h2>
      <p className="text-mono text-sm text-contour">Contact an administrator to request elevated permissions.</p>
    </div>
  )
}
