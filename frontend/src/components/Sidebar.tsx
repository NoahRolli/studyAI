// Sidebar — Hauptnavigation der Pallas App
// Wird links auf jeder Seite angezeigt (via Layout.tsx)
// Enthält Links zu allen Hauptbereichen: Dashboard, Journal
// Language-Toggle und Theme-Selector unten
// Design passt sich dem aktiven Theme an (CSS-Variablen)

import { NavLink } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import LanguageToggle from './LanguageToggle'
import ThemeSelector from './ThemeSelector'

function Sidebar() {
  // Translations-Objekt für aktuelle Sprache
  const { t } = useLanguage()

  // NavLink-Styling: Aktiver Link bekommt Akzent-Glow,
  // inaktive Links sind gedimmt und glühen beim Hover
  const linkStyle = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2.5 rounded-md transition-all duration-300 text-sm tracking-wide ${
      isActive
        ? 'text-[var(--color-primary)] bg-[rgba(0,212,255,0.1)] border border-[var(--color-border-glow)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[rgba(0,212,255,0.05)] border border-transparent'
    }`

  return (
    <aside
      className="w-64 p-6 flex flex-col border-r"
      style={{
        backgroundColor: 'var(--color-bg-base)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Logo / App-Name */}
      <h1 className="hud-title text-glow text-2xl font-bold mb-8">
        Pallas
      </h1>

      {/* Navigation — NavLink für Client-Side Routing */}
      <nav className="flex flex-col gap-2">
        <NavLink to="/" className={linkStyle} end>
          {t.sidebar.dashboard}
        </NavLink>
        <NavLink to="/journal" className={linkStyle}>
          {t.sidebar.journal}
        </NavLink>
      </nav>

      {/* Spacer — drückt alles Folgende nach unten */}
      <div className="mt-auto" />

      {/* Theme-Selector + Language-Toggle */}
      <div className="flex flex-col gap-3 mb-4">
        <ThemeSelector />
        <LanguageToggle />
      </div>

      {/* Trennlinie */}
      <div
        className="mb-4 h-px"
        style={{ backgroundColor: 'var(--color-border)' }}
      />

      {/* Footer mit Versionsnummer und Status-Indikator */}
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full animate-glow-pulse"
          style={{ backgroundColor: 'var(--color-success)' }}
        />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
          {t.sidebar.version}
        </span>
      </div>
    </aside>
  )
}

export default Sidebar