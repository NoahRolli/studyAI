// WelcomePage — Begrüssungsseite von Pallas
// Route: / (ohne Sidebar, eigenständiges Layout)
// Zeigt Branding, Schnellzugriff-Karten (Dashboard, Journal, Kalender)
// und eine 7-Tage-Agenda-Vorschau des Hauptkalenders

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import { get } from '../hooks/useAPI'
import LanguageToggle from '../components/LanguageToggle'
import ThemeSelector from '../components/ThemeSelector'

// Typ für Agenda-Items vom Backend
interface AgendaItem {
  event_id: number
  title: string
  description: string | null
  date: string
  end_time: string | null
  all_day: boolean
  color: string
  is_recurring: boolean
}

// Farb-Map: Event-Farben → CSS-Werte
const COLOR_MAP: Record<string, string> = {
  cyan: 'var(--color-primary)',
  violet: '#8b5cf6',
  emerald: '#10b981',
  orange: '#f59e0b',
  pink: '#ec4899',
  yellow: '#eab308',
}

function WelcomePage() {
  const { t } = useLanguage()
  const [agenda, setAgenda] = useState<AgendaItem[]>([])

  // Agenda laden (nächste 7 Tage)
  useEffect(() => {
    get<AgendaItem[]>('/api/calendar/agenda?days=7')
      .then((data) => setAgenda(data))
      .catch(() => setAgenda([]))
  }, [])

  // Datum formatieren (kurz, z.B. "Mo 31.03.")
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const weekday = t.mainCalendar.weekdays[
      date.getDay() === 0 ? 6 : date.getDay() - 1
    ]
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    return `${weekday} ${day}.${month}.`
  }

  // Uhrzeit formatieren (z.B. "14:30")
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 flex flex-col items-center px-8 pt-16 animate-fade-in">

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

      {/* Schnellzugriff-Karten: 3 Spalten */}
      <div className="flex flex-wrap justify-center gap-6 w-full max-w-3xl">

        {/* Dashboard-Karte */}
        {/* Erste Reihe: 3 Karten */}
        <Link to="/dashboard" className="group w-56">
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
        <Link to="/journal" className="group w-56">
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

        {/* Kalender-Karte */}
        <Link to="/calendar" className="group w-56">
          <div
            className="hud-card p-6 rounded-lg border transition-all duration-300
              group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="hud-title text-sm text-glow mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.welcome.calendarTitle}
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.welcome.calendarDesc}
            </p>
          </div>
        </Link>

      </div>

      {/* Zweite Reihe: Notes + Metis (zentriert) */}
      <div className="flex justify-center gap-6 w-full max-w-2xl mt-6">

        {/* Notes-Karte */}
        <Link to="/notes" className="group w-56">
          <div
            className="hud-card p-6 rounded-lg border transition-all duration-300
              group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="hud-title text-sm text-glow mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.welcome.notesTitle}
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.welcome.notesDesc}
            </p>
          </div>
        </Link>

        {/* Metis-Karte */}
        <Link to="/metis" className="group w-56">
          <div
            className="hud-card p-6 rounded-lg border transition-all duration-300
              group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="hud-title text-sm text-glow mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.welcome.metisTitle}
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.welcome.metisDesc}
            </p>
          </div>
        </Link>
      </div>

      {/* Agenda-Ausschnitt: Nächste 7 Tage */}
      <div className="w-full max-w-2xl mt-10">
        <h3
          className="hud-title text-xs text-glow mb-4 tracking-wide"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.mainCalendar.agenda}
        </h3>

        {agenda.length === 0 ? (
          <p
            className="text-xs text-center py-6"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.mainCalendar.agendaEmpty}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {agenda.slice(0, 5).map((item, idx) => (
              <Link
                to="/calendar"
                key={`${item.event_id}-${idx}`}
                className="hud-card p-3 rounded-md border flex items-center gap-3
                  transition-all duration-300 hover:border-[var(--color-primary)]
                  hover:shadow-[0_0_12px_rgba(0,212,255,0.1)]"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {/* Farb-Indikator */}
                <div
                  className="w-1.5 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLOR_MAP[item.color] || COLOR_MAP.cyan }}
                />

                {/* Datum + Zeit */}
                <div className="flex-shrink-0 w-20">
                  <span
                    className="text-xs font-medium block"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {formatDate(item.date)}
                  </span>
                  {!item.all_day && (
                    <span
                      className="text-xs"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {formatTime(item.date)}
                    </span>
                  )}
                </div>

                {/* Titel */}
                <div className="flex-1 min-w-0">
                  <span
                    className="text-xs truncate block"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {item.title}
                  </span>
                </div>

                {/* Wiederkehrend-Badge */}
                {item.is_recurring && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{
                      color: 'var(--color-text-muted)',
                      backgroundColor: 'rgba(0,212,255,0.08)',
                      fontSize: '0.6rem',
                    }}
                  >
                    ↻
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Theme + Language + Hinweis */}
      <div className="mt-auto pb-6 pt-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <ThemeSelector />
          <LanguageToggle />
        </div>
        <p
          className="text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t.welcome.hint}
        </p>
      </div>
    </div>
  )
}

export default WelcomePage