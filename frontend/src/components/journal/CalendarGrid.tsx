// CalendarGrid — Monatsraster für den Journal-Kalender
// Ausgelagert aus CalendarView für übersichtlichere Dateigrössen
// Zeigt Tage mit Entry-Dots (Mood-Glow) und Medikamenten-Pillen

import { useLanguage } from '../../hooks/useLanguage'
import type { WeatherDay } from '../../hooks/useWeather'
import { getWeatherIcon } from '../../hooks/useWeather'

// Typen für Kalender-Daten
interface CalendarEntry {
  id: number
  title: string
  date: string
}

interface IntakeCalendarEntry {
  medication_id: number
  med_name: string
  date: string
  status: 'taken' | 'skipped'
}

interface CalendarGridProps {
  year: number
  month: number
  calByDate: Record<string, CalendarEntry[]>
  intakeByDate: Record<string, IntakeCalendarEntry[]>
  moodById: Record<number, number>
  moodActive: boolean
  selectedDate: string | null
  onDayClick: (dateStr: string) => void
  onDayDoubleClick: (dateStr: string) => void
  weatherByDate: Record<string, WeatherDay>
}

// Tage im Monat berechnen
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// Wochentag-Offset (Mo=0 für europäisches Layout)
function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

// Mood-Score → Glow + Opacity
function getMoodStyle(score: number | undefined, active: boolean) {
  if (!active || score === undefined) {
    return { opacity: 0.7, glow: '0 0 6px var(--color-primary)' }
  }
  const op = 0.2 + ((score + 1) / 2) * 0.8
  const gl = Math.round(4 + ((score + 1) / 2) * 12)
  return { opacity: op, glow: `0 0 ${gl}px var(--color-primary)` }
}

function CalendarGrid({
  year, month, calByDate, intakeByDate, moodById,
  moodActive, selectedDate, onDayClick, onDayDoubleClick,
  weatherByDate,
}: CalendarGridProps) {
  const { t } = useLanguage()
  const todayStr = new Date().toISOString().split('T')[0]
  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOffset(year, month)

  return (
    <div>
      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {t.calendar.weekdays.map((d: string) => (
          <div
            key={d}
            className="text-center text-xs py-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Tage-Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Leere Felder vor dem 1. */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-20 rounded-lg" />
        ))}

        {/* Tagesfelder */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEntries = calByDate[dateStr] || []
          const dayIntakes = intakeByDate[dateStr] || []
          const weather = weatherByDate[dateStr]
          const isToday = dateStr === todayStr
          const isFuture = dateStr > todayStr
          const isSelected = dateStr === selectedDate

          return (
            <div
              key={day}
              onClick={() => onDayClick(dateStr)}
              onDoubleClick={() => onDayDoubleClick(dateStr)}
              className={`h-20 rounded-lg p-1.5 relative transition-all duration-200 ${
                isFuture ? 'opacity-30' : 'cursor-pointer'
              }`}
              style={{
                backgroundColor: isSelected
                  ? 'var(--color-active-bg)'
                  : isToday
                    ? 'var(--color-highlight-bg)'
                    : 'rgba(13, 17, 23, 0.3)',
                border: isSelected
                  ? '1px solid var(--color-highlight-strong)'
                  : isToday
                    ? '1px solid var(--color-highlight-border)'
                    : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isFuture && !isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)'
                  e.currentTarget.style.boxShadow = '0 0 15px var(--color-glow-soft)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isFuture && !isSelected) {
                  e.currentTarget.style.backgroundColor = isToday
                    ? 'var(--color-highlight-bg)'
                    : 'rgba(13, 17, 23, 0.3)'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
              {/* Tageszahl */}
              <span
                className="text-xs font-medium"
                style={{
                  color: isSelected || isToday
                    ? 'var(--color-primary)'
                    : 'var(--color-text-muted)',
                }}
              >
                {day}
              </span>

              {/* Entry-Dots mit Mood-Glow */}
              {dayEntries.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {dayEntries.map((entry) => {
                    const mood = getMoodStyle(moodById[entry.id], moodActive)
                    return (
                      <div
                        key={entry.id}
                        title={entry.title}
                        className="w-2 h-2 rounded-full transition-all"
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

              {/* Medikamenten-Pillen */}
              {dayIntakes.length > 0 && (
                <div className="absolute bottom-1 right-1 flex gap-0.5">
                  {dayIntakes.map((intake) => (
                    <div
                      key={`${intake.medication_id}-${intake.date}`}
                      title={`${intake.med_name}: ${intake.status === 'taken' ? '✓' : '✕'}`}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: intake.status === 'taken'
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                        boxShadow: intake.status === 'taken'
                          ? '0 0 4px rgba(0, 255, 136, 0.4)'
                          : '0 0 4px rgba(255, 59, 92, 0.4)',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Wetter + Mond */}
              {weather && (
                <div className="absolute bottom-1 left-1 flex items-center gap-0.5"
                  title={weather.moon ? weather.moon.name_de : ''}>
                  {weather.weather_key && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.55rem' }}>
                      {getWeatherIcon(weather.weather_key)}
                    </span>
                  )}
                  {weather.temp_max !== null && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.5rem' }}>
                      {Math.round(weather.temp_max)}°
                    </span>
                  )}
                  {weather.moon && (
                    <span style={{ fontSize: '0.5rem' }}
                      title={weather.moon.name_de}>
                      {weather.moon.symbol}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarGrid