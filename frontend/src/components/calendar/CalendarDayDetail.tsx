// CalendarDayDetail — Event-Liste + Sport-Einträge für selektierten Tag
// Zeigt Events mit Farb-Indikator, Bearbeiten, Löschen
// Sport-Einträge mit Typ, Dauer, Intensität

import { useLanguage } from '../../hooks/useLanguage'
import type { CalendarEvent } from '../../hooks/useCalendarState'
import type { SportEntry } from '../../hooks/useSportEntries'

// Farb-Map für Event-Punkte
const COLOR_MAP: Record<string, string> = {
  cyan: '#7dd8e8', violet: '#a78bda', emerald: '#7dd4a3',
  orange: '#d4a574', pink: '#d47d9a', yellow: '#d4cc7d',
}

interface Props {
  date: string
  events: CalendarEvent[]
  sportEntries: SportEntry[]
  sportEnabled: boolean
  onNewEvent: () => void
  onEditEvent: (e: CalendarEvent) => void
  onDeleteEvent: (e: CalendarEvent) => void
  onNewSport: () => void
  onEditSport: (e: SportEntry) => void
  onDeleteSport: (e: SportEntry) => void
}

export default function CalendarDayDetail({
  date, events, sportEntries, sportEnabled,
  onNewEvent, onEditEvent, onDeleteEvent,
  onNewSport, onEditSport, onDeleteSport,
}: Props) {
  const { t } = useLanguage()

  const formatted = new Date(date + 'T00:00').toLocaleDateString('de-CH', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="mt-6 hud-card p-4 rounded-lg border animate-fade-in"
      style={{ borderColor: 'var(--color-border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium"
          style={{ color: 'var(--color-text-primary)' }}>
          {formatted}
        </span>
        <div className="flex gap-2">
          {sportEnabled && (
            <button className="hud-btn text-xs px-3 py-1" onClick={onNewSport}>
              + {t.sport?.newTitle || 'Training'}
            </button>
          )}
          <button className="hud-btn hud-btn-primary text-xs px-3 py-1"
            onClick={onNewEvent}>
            {t.mainCalendar.newEvent}
          </button>
        </div>
      </div>

      {/* Events */}
      {events.length === 0 && (!sportEnabled || sportEntries.length === 0) && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t.mainCalendar.emptyTitle}
        </p>
      )}
      {events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((evt) => (
            <div key={evt.id}
              className="flex items-center gap-2 p-2 rounded-md
                transition-all duration-200 hover:bg-[var(--color-hover-bg)]">
              <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan }} />
              <button onClick={() => onEditEvent(evt)}
                className="flex-1 min-w-0 text-left">
                <span className="text-xs block truncate"
                  style={{ color: 'var(--color-text-primary)' }}>{evt.title}</span>
                {!evt.all_day && (
                  <span className="text-xs"
                    style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                    {new Date(evt.start_time).toLocaleTimeString('de-CH', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
              </button>
              {evt.recurrence !== 'none' && (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--color-text-muted)',
                    backgroundColor: 'var(--color-hover-bg)', fontSize: '0.6rem' }}>
                  ↻
                </span>
              )}
              <button onClick={() => onDeleteEvent(evt)}
                className="flex-shrink-0 p-1 rounded transition-all duration-200
                  hover:bg-[rgba(255,59,92,0.1)]"
                title={t.mainCalendar.deleteEvent}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="var(--color-danger)"
                    strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sport-Einträge */}
      {sportEnabled && sportEntries.length > 0 && (
        <div className="flex flex-col gap-2 mt-3 pt-3"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          {sportEntries.map((se) => (
            <div key={se.id}
              className="flex items-center gap-2 p-2 rounded-md
                transition-all duration-200 hover:bg-[var(--color-hover-bg)]">
              <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                style={{ backgroundColor: '#4ade80' }} />
              <button onClick={() => onEditSport(se)}
                className="flex-1 min-w-0 text-left">
                <span className="text-xs block truncate"
                  style={{ color: 'var(--color-text-primary)' }}>
                  {se.sport_type}
                </span>
                <span className="text-xs"
                  style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                  {se.duration_min && `${se.duration_min}min`}
                  {se.intensity && ` · ${se.intensity}/5`}
                </span>
              </button>
              {se.note && (
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--color-text-muted)',
                    backgroundColor: 'var(--color-hover-bg)', fontSize: '0.6rem' }}>
                  ...
                </span>
              )}
              <button onClick={() => onDeleteSport(se)}
                className="flex-shrink-0 p-1 rounded transition-all duration-200
                  hover:bg-[rgba(255,59,92,0.1)]"
                title={t.sport?.deleteConfirm || 'Löschen'}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="var(--color-danger)"
                    strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
