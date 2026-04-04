// WelcomeCards — Schnellzugriff-Karten + Agenda für WelcomePage
// Extrahiert aus WelcomePage für Dateigrößen-Limit

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'
import { get } from '../../hooks/useAPI'

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

const COLOR_MAP: Record<string, string> = {
  cyan: 'var(--color-primary)',
  violet: '#8b5cf6',
  emerald: '#10b981',
  orange: '#f59e0b',
  pink: '#ec4899',
  yellow: '#eab308',
}

// Einzelne Karten-Definition
const CARDS = [
  { to: '/dashboard', titleKey: 'dashboardTitle', descKey: 'dashboardDesc' },
  { to: '/journal', titleKey: 'journalTitle', descKey: 'journalDesc' },
  { to: '/calendar', titleKey: 'calendarTitle', descKey: 'calendarDesc' },
  { to: '/notes', titleKey: 'notesTitle', descKey: 'notesDesc' },
  { to: '/metis', titleKey: 'metisTitle', descKey: 'metisDesc' },
]

interface Props {
  visible: boolean
  delayBase: number
}

export default function WelcomeCards({ visible, delayBase }: Props) {
  const { t } = useLanguage()
  const [agenda, setAgenda] = useState<AgendaItem[]>([])

  useEffect(() => {
    get<AgendaItem[]>('/api/calendar/agenda?days=7')
      .then((data) => setAgenda(data))
      .catch(() => setAgenda([]))
  }, [])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const weekday = t.mainCalendar.weekdays[
      date.getDay() === 0 ? 6 : date.getDay() - 1
    ]
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    return `${weekday} ${day}.${month}.`
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('de-CH', {
      hour: '2-digit', minute: '2-digit',
    })
  }

  const w = t.welcome as Record<string, string>

  return (
    <>
      {/* Erste Reihe: 3 Karten */}
      <div className="flex flex-wrap justify-center gap-6 w-full max-w-3xl">
        {CARDS.slice(0, 3).map((card, i) => (
          <Link
            key={card.to}
            to={card.to}
            className="group w-56"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: `opacity 0.4s ease ${delayBase + i * 100}ms, transform 0.4s ease ${delayBase + i * 100}ms`,
            }}
          >
            <div
              className="hud-card p-6 rounded-lg border transition-all duration-300 h-36
                group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h2
                className="hud-title text-sm text-glow mb-2"
                style={{ color: 'var(--color-primary)' }}
              >
                {w[card.titleKey]}
              </h2>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {w[card.descKey]}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Zweite Reihe: 2 Karten */}
      <div className="flex justify-center gap-6 w-full max-w-2xl mt-6">
        {CARDS.slice(3).map((card, i) => (
          <Link
            key={card.to}
            to={card.to}
            className="group w-56"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: `opacity 0.4s ease ${delayBase + (i + 3) * 100}ms, transform 0.4s ease ${delayBase + (i + 3) * 100}ms`,
            }}
          >
            <div
              className="hud-card p-6 rounded-lg border transition-all duration-300 h-36
                group-hover:border-[var(--color-primary)] group-hover:shadow-[0_0_20px_rgba(0,212,255,0.15)]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h2
                className="hud-title text-sm text-glow mb-2"
                style={{ color: 'var(--color-primary)' }}
              >
                {w[card.titleKey]}
              </h2>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {w[card.descKey]}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Agenda */}
      <div
        className="w-full max-w-2xl mt-10"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity 0.4s ease ${delayBase + 600}ms`,
        }}
      >
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
                <div
                  className="w-1.5 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLOR_MAP[item.color] || COLOR_MAP.cyan }}
                />
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
                <div className="flex-1 min-w-0">
                  <span
                    className="text-xs truncate block"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {item.title}
                  </span>
                </div>
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
    </>
  )
}
