// WelcomePage — Begrüssungsseite von Pallas
// Route: /
// Zeigt Branding, kurze Beschreibung und Schnellzugriff-Karten
// zu den Hauptbereichen (Dashboard, Journal)

import { Link } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'

function WelcomePage() {
  const { t } = useLanguage()

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 animate-fade-in">
      {/* Logo + Titel */}
      <h1
        className="hud-title text-glow text-5xl font-bold mb-3 tracking-widest"
        style={{ color: 'var(--color-primary)' }}
      >
        PALLAS
      </h1>
      <p
        className="text-sm mb-12 tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t.welcome.subtitle}
      </p>

      {/* Schnellzugriff-Karten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-lg">
        {/* Dashboard-Karte */}
        <Link to="/dashboard" className="group">
          <div
            className="hud-card p-6 rounded-lg border transition-all duration-300
              group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="hud-title text-sm text-glow mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.welcome.dashboardTitle}
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.welcome.dashboardDesc}
            </p>
          </div>
        </Link>

        {/* Journal-Karte */}
        <Link to="/journal" className="group">
          <div
            className="hud-card p-6 rounded-lg border transition-all duration-300
              group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="hud-title text-sm text-glow mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.welcome.journalTitle}
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.welcome.journalDesc}
            </p>
          </div>
        </Link>
      </div>

      {/* Footer-Hinweis */}
      <p
        className="mt-12 text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t.welcome.hint}
      </p>
    </div>
  )
}

export default WelcomePage