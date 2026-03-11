// Layout — Grundgerüst der gesamten App
// Wird als Wrapper um alle Seiten verwendet (via React Router)
// Besteht aus zwei Bereichen:
// - Links: Sidebar (Navigation, immer sichtbar)
// - Rechts: Content-Bereich (wechselt je nach Route)
//
// Die <Outlet /> Komponente von React Router rendert automatisch
// die aktuelle Unterseite (Dashboard, Journal, etc.)

import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

function Layout() {
  return (
    // Äusserer Container: Volle Bildschirmhöhe, dunkler Hintergrund
    // flex = Sidebar und Content nebeneinander (horizontal)
    <div className="min-h-screen bg-gray-950 text-white flex">

      {/* Sidebar links — bleibt immer sichtbar */}
      <Sidebar />

      {/* Content rechts — hier wird die aktuelle Seite gerendert
          flex-1 = nimmt den gesamten verbleibenden Platz ein
          p-8 = Padding rundherum für Abstand zum Rand */}
      <main className="flex-1 p-8">
        {/* Outlet = Platzhalter für die aktuelle Route
            Wenn URL = "/" → Dashboard wird hier gerendert
            Wenn URL = "/journal" → Journal wird hier gerendert */}
        <Outlet />
      </main>
    </div>
  )
}

// Default Export — wird in App.tsx als Route-Element verwendet
export default Layout