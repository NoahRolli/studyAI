// Sidebar — Hauptnavigation der Pallas App
// Wird links auf jeder Seite angezeigt (via Layout.tsx)
// Enthält Links zu allen Hauptbereichen: Dashboard, Journal
// Futuristisches Design mit Glow-Effekten und Orbitron Font
// Später kommen hinzu: Modul-Liste, Settings, AI-Provider-Wechsel

import { NavLink } from 'react-router-dom'

function Sidebar() {
  // NavLink-Styling: Aktiver Link bekommt Cyan-Glow,
  // inaktive Links sind gedimmt und glühen beim Hover
  // isActive wird automatisch von React Router gesetzt
  const linkStyle = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2.5 rounded-md transition-all duration-300 text-sm tracking-wide ${
      isActive
        ? 'text-[var(--color-primary)] bg-[rgba(0,212,255,0.1)] border border-[var(--color-border-glow)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[rgba(0,212,255,0.05)] border border-transparent'
    }`

  return (
    // aside = semantisches HTML für Seitenleisten
    // Feste Breite, dunkler Hintergrund, rechter Rand mit Glow
    <aside
      className="w-64 p-6 flex flex-col border-r"
      style={{
        backgroundColor: 'var(--color-bg-base)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Logo / App-Name — Orbitron Font, Cyan-Glow */}
      <h1 className="hud-title text-glow text-2xl font-bold mb-8">
        Pallas
      </h1>

      {/* Navigation — NavLink statt <a> für Client-Side Routing
          Das heisst: Kein Seiten-Neuladen, nur der Content-Bereich wechselt */}
      <nav className="flex flex-col gap-2">
        {/* to="/" → Dashboard (Startseite) */}
        <NavLink to="/" className={linkStyle} end>
          Dashboard
        </NavLink>

        {/* to="/journal" → Verschlüsseltes Tagebuch */}
        <NavLink to="/journal" className={linkStyle}>
          Journal
        </NavLink>
      </nav>

      {/* Trennlinie — subtiler Cyan-Hauch */}
      <div
        className="mt-auto mb-4 h-px"
        style={{ backgroundColor: 'var(--color-border)' }}
      />

      {/* Footer mit Versionsnummer und Status-Indikator */}
      <div className="flex items-center gap-2">
        {/* Pulsierender Punkt — zeigt dass das System aktiv ist */}
        <div className="w-2 h-2 rounded-full animate-glow-pulse"
          style={{ backgroundColor: 'var(--color-success)' }}
        />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
          v0.1.0 — ONLINE
        </span>
      </div>
    </aside>
  )
}

export default Sidebar