// Layout — Grundgerüst der gesamten App
// Sidebar auf Desktop sichtbar, auf Mobile als Overlay via Hamburger
// Hintergrund: subtiles Grid-Raster im HUD-Style

import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import GlobalTaskBar from './GlobalTaskBar'

function Layout() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isWelcomePage = location.pathname === '/'

  // Mobile-Menue schliessen bei Navigation
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  return (
    <div className="h-screen flex hud-grid-bg overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-deep)' }}>

      {/* Sidebar — Desktop: normal, Mobile: Overlay */}
      {!isWelcomePage && (
        <>
          {/* Desktop Sidebar */}
          <div className="hidden md:flex">
            <Sidebar />
          </div>

          {/* Mobile Hamburger */}
          <button onClick={() => setMobileMenuOpen(true)}
            className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md"
            style={{
              color: 'var(--color-primary)',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
            }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>

          {/* Mobile Overlay */}
          {mobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setMobileMenuOpen(false)}>
              <div className="h-full w-64" onClick={e => e.stopPropagation()}>
                <Sidebar />
              </div>
            </div>
          )}
        </>
      )}

      {/* Content */}
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        <Outlet />
      </main>
      <GlobalTaskBar />
    </div>
  )
}

export default Layout
