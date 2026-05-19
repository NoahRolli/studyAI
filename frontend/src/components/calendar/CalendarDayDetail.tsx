// CalendarDayDetail — Event-Liste + Sport + Git-Commits für selektierten Tag
// Events mit Farb-Indikator, Sport mit Typ/Dauer, Git mit Commits/Arbeitszeit
//
// Phase 1E: iCloud-Badge fuer Events mit source='icloud'
// - Kleine Pill "iCloud · <Calendar-Name>"
// - Delete-Button versteckt (Backend wuerde 403 zurueckgeben)
// - Klick auf Title oeffnet read-only-Form (siehe CalendarEventForm)

import { useLanguage } from '../../hooks/useLanguage'
import type { CalendarEvent } from '../../hooks/useCalendarState'
import type { SportEntry } from '../../hooks/useSportEntries'
import type { GitDay } from '../../hooks/useGitCommits'
import { useICloudCalendars } from '../../hooks/useICloudCalendars'

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
  gitDay: GitDay | null
  gitEnabled: boolean
  onNewEvent: () => void
  onEditEvent: (e: CalendarEvent) => void
  onDeleteEvent: (e: CalendarEvent) => void
  onNewSport: () => void
  onEditSport: (e: SportEntry) => void
  onDeleteSport: (e: SportEntry) => void
}

export default function CalendarDayDetail({
  date, events, sportEntries, sportEnabled,
  gitDay, gitEnabled,
  onNewEvent, onEditEvent, onDeleteEvent,
  onNewSport, onEditSport, onDeleteSport,
}: Props) {
  const { t } = useLanguage()
  const { nameById } = useICloudCalendars()

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

      {/* Leer-Zustand */}
      {events.length === 0 && (!sportEnabled || sportEntries.length === 0)
        && (!gitEnabled || !gitDay) && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t.mainCalendar.emptyTitle}
        </p>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((evt) => {
            const isICloud = evt.source === 'icloud'
            const readOnly = isICloud || evt.is_readonly === true
            const calName = isICloud ? nameById(evt.external_calendar_id) : null
            return (
              <div key={evt.id}
                className="flex items-center gap-2 p-2 rounded-md
                  transition-all duration-200 hover:bg-[var(--color-hover-bg)]">
                <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan }} />
                <button onClick={() => onEditEvent(evt)}
                  className="flex-1 min-w-0 text-left">
                  <span className="text-xs block truncate"
                    style={{ color: 'var(--color-text-primary)' }}>{evt.title}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!evt.all_day && (
                      <span className="text-xs"
                        style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                        {new Date(evt.start_time).toLocaleTimeString('de-CH', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    )}
                    {evt.location && (
                      <span className="text-xs"
                        style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                        · {evt.location}
                      </span>
                    )}
                    {isICloud && (
                      <span className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                        style={{
                          color: 'var(--color-primary)',
                          backgroundColor: 'var(--color-active-bg)',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.55rem',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                        title={`Quelle: iCloud-Kalender "${calName}"`}>
                        iCloud · {calName}
                      </span>
                    )}
                  </div>
                </button>
                {evt.recurrence !== 'none' && !isICloud && (
                  <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--color-text-muted)',
                      backgroundColor: 'var(--color-hover-bg)', fontSize: '0.6rem' }}>
                    ↻
                  </span>
                )}
                {!readOnly && (
                  <button onClick={() => onDeleteEvent(evt)}
                    className="flex-shrink-0 p-1 rounded transition-all duration-200
                      hover:bg-[rgba(255,59,92,0.1)]"
                    title={t.mainCalendar.deleteEvent}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="var(--color-danger)"
                        strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                {readOnly && (
                  <span className="flex-shrink-0 p-1" title="Read-only">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M4 7V5a3 3 0 116 0v2M3 7h8v5H3V7z"
                        stroke="var(--color-text-muted)"
                        strokeWidth="1.2" fill="none" />
                    </svg>
                  </span>
                )}
              </div>
            )
          })}
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

      {/* Git-Commits */}
      {gitEnabled && gitDay && (
        <div className="mt-3 pt-3"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          {/* Git-Header mit Statistik */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-5 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#a855f7' }} />
            <span className="text-xs font-medium"
              style={{ color: '#a855f7' }}>
              {gitDay.count} Commits
            </span>
            <span className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}>
              {gitDay.repos.join(', ')}
            </span>
            {gitDay.work_hours > 0 && (
              <span className="text-xs ml-auto"
                style={{ color: 'var(--color-text-muted)' }}>
                {gitDay.work_hours}h
              </span>
            )}
          </div>
          {/* Commit-Liste */}
          <div className="flex flex-col gap-1 ml-4">
            {gitDay.commits.slice(0, 8).map((c) => (
              <div key={c.sha} className="flex items-baseline gap-2">
                <span className="text-xs font-mono shrink-0"
                  style={{ color: '#a855f7', fontSize: '0.6rem' }}>
                  {c.sha}
                </span>
                <span className="text-xs truncate"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  {c.message}
                </span>
                <span className="text-xs shrink-0 ml-auto"
                  style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                  {c.time}
                </span>
              </div>
            ))}
            {gitDay.commits.length > 8 && (
              <span className="text-xs"
                style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                +{gitDay.commits.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
