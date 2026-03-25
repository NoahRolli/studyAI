// CalendarView — Monatskalender für Journal-Einträge
// Zeigt Tage als Grid, Einträge als Cyan-Punkte
// Mood-Toggle: Glow-Intensität + Opacity zeigt Stimmung
// Kein Content sichtbar — nur Titel im Tooltip beim Hover

import { useState, useEffect } from 'react'
import { get, post } from '../../hooks/useAPI'
import type { MoodResult } from '../../types/models'

// Kalender-Eintrag vom Backend (kein Content!)
interface CalendarEntry {
  id: number
  title: string
  date: string
}

// Props von Journal.tsx
interface CalendarViewProps {
  moods: MoodResult[]
  moodsLoaded: boolean
  onLoadMoods: () => void
}

// Hilfsfunktion: Tage im Monat berechnen
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// Hilfsfunktion: Wochentag des 1. (0=So, 1=Mo, ..., 6=Sa)
// Konvertiert zu Mo=0 Start für europäisches Layout
function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

// Mood-Score → Glow + Opacity Werte
// Score: -1.0 (negativ) bis 1.0 (positiv)
function getMoodStyle(score: number | undefined, moodActive: boolean) {
  if (!moodActive || score === undefined) {
    // Mood aus oder kein Score → neutraler Punkt
    return { opacity: 0.7, glow: '0 0 6px var(--color-primary)' }
  }
  // Score normalisieren: -1..1 → 0.2..1.0 (Opacity)
  const normalizedOpacity = 0.2 + ((score + 1) / 2) * 0.8
  // Glow-Stärke: negativ=schwach, positiv=stark
  const glowSize = Math.round(4 + ((score + 1) / 2) * 12)
  return {
    opacity: normalizedOpacity,
    glow: `0 0 ${glowSize}px var(--color-primary)`,
  }
}

function CalendarView({ moods, moodsLoaded, onLoadMoods }: CalendarViewProps) {
  // Aktueller Monat als Startpunkt
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [moodActive, setMoodActive] = useState(false)

  // Wochentag-Header (Mo–So)
  const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  // Monat als "YYYY-MM" String für API
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

  // Einträge laden wenn Monat wechselt
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await get<CalendarEntry[]>(
          `/api/journal/calendar/?month=${monthStr}`
        )
        setEntries(data)
      } catch {
        setEntries([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [monthStr])

  // Mood-Daten laden wenn Toggle aktiviert wird
  useEffect(() => {
    if (moodActive && !moodsLoaded) {
      onLoadMoods()
    }
  }, [moodActive, moodsLoaded, onLoadMoods])

  // Monat navigieren
  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  // Kalender-Grid berechnen
  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOffset(year, month)

  // Einträge nach Datum gruppieren (key: "YYYY-MM-DD")
  const entriesByDate: Record<string, CalendarEntry[]> = {}
  for (const entry of entries) {
    if (!entriesByDate[entry.date]) entriesByDate[entry.date] = []
    entriesByDate[entry.date].push(entry)
  }

  // Mood-Score nach Entry-ID
  const moodByEntryId: Record<number, number> = {}
  for (const m of moods) {
    if (m.score !== undefined) moodByEntryId[m.entry_id] = m.score
  }

  // Monatsname für Header
  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ]

  // Heute-Datum als String für Highlight
  const todayStr = today.toISOString().split('T')[0]

  return (
    <div className="animate-fade-in">
      {/* Navigation: Monat vor/zurück + Mood-Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="hud-btn px-3 py-1">
            ‹
          </button>
          <span className="hud-title text-base" style={{ minWidth: '160px', textAlign: 'center' }}>
            {monthNames[month]} {year}
          </span>
          <button onClick={nextMonth} className="hud-btn px-3 py-1">
            ›
          </button>
        </div>
        {/* Mood-Glow Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={moodActive}
            onChange={() => setMoodActive(!moodActive)}
            className="w-4 h-4 rounded accent-[var(--color-primary)]"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Mood-Glow
          </span>
        </label>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-center text-xs py-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Kalender-Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Leere Zellen vor dem 1. */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-20 rounded-lg" />
        ))}

        {/* Tages-Zellen */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEntries = entriesByDate[dateStr] || []
          const isToday = dateStr === todayStr

          return (
            <div
              key={day}
              className="h-20 rounded-lg p-1.5 relative transition-colors"
              style={{
                backgroundColor: isToday
                  ? 'rgba(0, 255, 255, 0.06)'
                  : 'rgba(13, 17, 23, 0.3)',
                border: isToday
                  ? '1px solid rgba(0, 255, 255, 0.3)'
                  : '1px solid transparent',
              }}
            >
              {/* Tageszahl */}
              <span
                className="text-xs font-medium"
                style={{
                  color: isToday
                    ? 'var(--color-primary)'
                    : 'var(--color-text-muted)',
                }}
              >
                {day}
              </span>

              {/* Eintrag-Punkte */}
              {dayEntries.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {dayEntries.map((entry) => {
                    const mood = getMoodStyle(
                      moodByEntryId[entry.id],
                      moodActive
                    )
                    return (
                      <div
                        key={entry.id}
                        title={entry.title}
                        className="w-2 h-2 rounded-full cursor-pointer transition-all"
                        style={{
                          backgroundColor: 'var(--color-primary)',
                          opacity: mood.opacity,
                          boxShadow: mood.glow,
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Loading-Indikator */}
      {loading && (
        <p className="text-center mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Kalender wird geladen...
        </p>
      )}
    </div>
  )
}

export default CalendarView