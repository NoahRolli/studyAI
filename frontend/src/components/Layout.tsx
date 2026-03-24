// Layout — Grundgerüst der gesamten App
// Wird als Wrapper um alle Seiten verwendet (via React Router)
// Besteht aus zwei Bereichen:
// - Links: Sidebar (Navigation, immer sichtbar)
// - Rechts: Content-Bereich (wechselt je nach Route)
//
// Die <Outlet /> Komponente von React Router rendert automatisch
// die aktuelle Unterseite (Dashboard, Journal, etc.)
// Hintergrund: subtiles Grid-Raster im HUD-Style

import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

function Layout() {
  return (
    // Äusserer Container: Volle Bildschirmhöhe, tiefschwarzer Hintergrund
    // hud-grid-bg = subtiles Cyan-Raster (definiert in index.css)
    <div className="min-h-screen flex hud-grid-bg"
      style={{ backgroundColor: 'var(--color-bg-deep)' }}
    >
      {/* Sidebar links — bleibt immer sichtbar */}
      <Sidebar />

      {/* Content rechts — hier wird die aktuelle Seite gerendert
          flex-1 = nimmt den gesamten verbleibenden Platz ein
          p-8 = Padding rundherum für Abstand zum Rand */}
      <main className="flex-1 p-8 overflow-auto">
        {/* Outlet = Platzhalter für die aktuelle Route
            Wenn URL = "/" → Dashboard wird hier gerendert
            Wenn URL = "/journal" → Journal wird hier gerendert */}
        <Outlet />
      </main>
    </div>
  )
}

export default Layout