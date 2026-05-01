// Layout — Grundgerüst der gesamten App
// Wird als Wrapper um alle Seiten verwendet (via React Router)
// Sidebar wird auf der WelcomePage (/) ausgeblendet
// Hintergrund: subtiles Grid-Raster im HUD-Style

import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import GlobalTaskBar from './GlobalTaskBar'
import DelphiBubble from './delphi/DelphiBubble'

function Layout() {
  const location = useLocation()

  // Sidebar auf der Begrüssungsseite ausblenden
  const isWelcomePage = location.pathname === '/'
  // DelphiBubble auf der Delphi-Page selbst ausblenden (vermeidet Doppelung)
  const isDelphiPage = location.pathname.startsWith('/delphi')

  return (
    <div
      className="h-screen flex hud-grid-bg overflow-hidden"
      style={{ backgroundColor: 'var(--color-bg-deep)' }}
    >
      {/* Sidebar nur auf Unterseiten anzeigen */}
      {!isWelcomePage && <Sidebar />}

      {/* Content — nimmt den gesamten verbleibenden Platz ein */}
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
      <GlobalTaskBar />
      {/* Delphi Quick-Access Bubble - ueberall ausser auf /delphi selbst */}
      {!isDelphiPage && <DelphiBubble />}
    </div>
  )
}

export default Layout
