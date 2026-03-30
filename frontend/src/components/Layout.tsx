// Layout — Grundgerüst der gesamten App
// Wird als Wrapper um alle Seiten verwendet (via React Router)
// Sidebar wird auf der WelcomePage (/) ausgeblendet
// Hintergrund: subtiles Grid-Raster im HUD-Style

import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

function Layout() {
  const location = useLocation()

  // Sidebar auf der Begrüssungsseite ausblenden
  const isWelcomePage = location.pathname === '/'

  return (
    <div
      className="min-h-screen flex hud-grid-bg"
      style={{ backgroundColor: 'var(--color-bg-deep)' }}
    >
      {/* Sidebar nur auf Unterseiten anzeigen */}
      {!isWelcomePage && <Sidebar />}

      {/* Content — nimmt den gesamten verbleibenden Platz ein */}
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout