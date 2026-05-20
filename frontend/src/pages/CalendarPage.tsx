// CalendarPage — Hauptkalender mit Monatsansicht + Sport + Git Tracker
// Sport-Toggle + Git-Toggle in localStorage
// Sport = grüner Punkt, Git = lila Punkt im Grid
//
// Phase 1E: readOnly-Mode an EventForm fuer iCloud-Events durchreichen

import { useState } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import useCalendarState from '../hooks/useCalendarState'
import useSportEntries from '../hooks/useSportEntries'
import { useGitCommits } from '../hooks/useGitCommits'
import { useICloudCalendars } from '../hooks/useICloudCalendars'
import CalendarEventForm, { emptyFormData } from '../components/CalendarEventForm'
import CalendarDayDetail from '../components/calendar/CalendarDayDetail'
import SportModal from '../components/sport/SportModal'
import SportHeaderWidget from '../components/sport/SportHeaderWidget'
import type { SportFormData } from '../components/sport/SportModal'
import type { SportEntry } from '../hooks/useSportEntries'

// Farb-Map für Event-Punkte
const COLOR_MAP: Record<string, string> = {
  cyan: '#00d4ff', green: '#4ade80', orange: '#f59e0b',
  red: '#ef4444', purple: '#a855f7', blue: '#3b82f6',
}

export function CalendarPage() {
  const { t } = useLanguage()
  const cal = useCalendarState()
  const sport = useSportEntries(cal.month, cal.year)
  const gitCommits = useGitCommits(cal.month, cal.year)
  const { nameById } = useICloudCalendars()
  const [sportModalOpen, setSportModalOpen] = useState(false)
  const [editSport, setEditSport] = useState<SportEntry | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  const handleSportSave = async (data: SportFormData) => {
    if (editSport) {
      await sport.updateEntry(editSport.id, data)
    } else {
      await sport.createEntry({ ...data, date: cal.selectedDate! })
    }
    setSportModalOpen(false); setEditSport(null)
  }

  const handleSportDelete = async () => {
    if (!editSport) return
    await sport.deleteEntry(editSport.id)
    setSportModalOpen(false); setEditSport(null)
  }

  // Zellen-Styling
  const getCellStyle = (dateStr: string) => {
    const selected = dateStr === cal.selectedDate
    const today = cal.isToday(dateStr)
    const hovered = dateStr === hoveredDate
    if (selected) return {
      background: 'var(--color-hover-bg)',
      border: '1px solid var(--color-primary)',
      boxShadow: '0 0 10px var(--color-primary)30',
    }
    if (today) return {
      background: 'var(--color-active-bg)',
      border: '1px solid var(--color-primary)40',
    }
    if (hovered) return {
      background: 'var(--color-hover-bg)',
      border: '1px solid var(--color-border)',
    }
    return { background: 'var(--color-bg-surface)', border: '1px solid transparent' }
  }

  // Phase 1E: ist das aktuell editierte Event ein iCloud-Event?
  const editingICloud = cal.editEvent?.source === 'icloud'
  const editingICloudCalName = editingICloud
    ? nameById(cal.editEvent?.external_calendar_id)
    : null
  const editingICloudLocation = editingICloud
    ? cal.editEvent?.location || null
    : null

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="hud-title text-glow text-2xl"
            style={{ color: 'var(--color-primary)' }}>
            {t.mainCalendar.title}
          </h1>
          {/* Sport-Toggle */}
          <button
            className="text-xs px-2 py-1 rounded-md border transition-all"
            style={{
              borderColor: sport.enabled ? '#4ade80' : 'var(--color-border)',
              color: sport.enabled ? '#4ade80' : 'var(--color-text-muted)',
              background: sport.enabled ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
            }}
            onClick={() => sport.setEnabled(!sport.enabled)}
            title={t.sport?.toggle || 'Sport-Tracking'}>
            {t.sport?.toggle || 'Sport'}
          </button>
          {/* Git-Toggle */}
          <button
            className="text-xs px-2 py-1 rounded-md border transition-all"
            style={{
              borderColor: gitCommits.enabled ? '#a855f7' : 'var(--color-border)',
              color: gitCommits.enabled ? '#a855f7' : 'var(--color-text-muted)',
              background: gitCommits.enabled ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
            }}
            onClick={() => gitCommits.setEnabled(!gitCommits.enabled)}
            title="Git Commits">
            Git
          </button>
        </div>
        <div className="flex items-center gap-3">
          <SportHeaderWidget enabled={sport.enabled} />
          <button className="hud-btn px-3 py-1" onClick={cal.prevMonth}>‹</button>
          <span className="hud-title text-base"
            style={{ minWidth: '160px', textAlign: 'center' }}>
            {t.mainCalendar.months[cal.month - 1]} {cal.year}
          </span>
          <button className="hud-btn px-3 py-1" onClick={cal.nextMonth}>›</button>
        </div>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {(t.mainCalendar.weekdays).map((wd: string) => (
          <div key={wd} className="text-center text-xs py-1"
            style={{ color: 'var(--color-text-muted)' }}>{wd}</div>
        ))}
      </div>

      {/* Kalender-Grid */}
      <div className="grid grid-cols-7 gap-1.5 mb-6">
        {Array.from({ length: cal.startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-20 rounded-lg" />
        ))}
        {Array.from({ length: cal.daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${cal.year}-${String(cal.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvts = cal.eventsForDay(day)
          const daySport = sport.forDate(dateStr)
          const dayGit = gitCommits.forDate(dateStr)
          const today = cal.isToday(dateStr)
          const selected = dateStr === cal.selectedDate

          return (
            <div key={day}
              onClick={() => cal.handleDayClick(dateStr)}
              onDoubleClick={() => cal.handleDayDoubleClick(dateStr)}
              onMouseEnter={() => setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
              className="h-20 rounded-lg p-1.5 relative transition-all duration-200 cursor-pointer"
              style={getCellStyle(dateStr)}>
              <span className="text-xs font-medium" style={{
                color: selected || today ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}>{day}</span>

              <div className="flex flex-wrap gap-1 mt-1">
                {dayEvts.slice(0, 4).map((evt) => {
                  const isICloud = evt.source === 'icloud'
                  const baseColor = COLOR_MAP[evt.color] || COLOR_MAP.cyan
                  return (
                    <div key={evt.id} className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isICloud ? 'transparent' : baseColor,
                        border: isICloud ? `1.5px solid ${baseColor}` : 'none',
                        boxShadow: `0 0 6px ${baseColor}`,
                      }}
                      title={isICloud ? 'iCloud-Event' : evt.title} />
                  )
                })}
                {dayEvts.length > 4 && (
                  <span className="text-xs"
                    style={{ color: 'var(--color-text-muted)', fontSize: '0.5rem' }}>
                    +{dayEvts.length - 4}
                  </span>
                )}
                {/* Sport-Indikator */}
                {sport.enabled && daySport.length > 0 && (
                  <div className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#4ade80',
                      boxShadow: '0 0 6px #4ade80' }} />
                )}
                {/* Git-Indikator */}
                {gitCommits.enabled && dayGit && (
                  <div className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#a855f7',
                      boxShadow: '0 0 6px #a855f7' }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tag-Detail */}
      {cal.selectedDate && (
        <CalendarDayDetail
          date={cal.selectedDate}
          events={cal.dayEvents}
          sportEntries={sport.forDate(cal.selectedDate)}
          sportEnabled={sport.enabled}
          gitDay={gitCommits.forDate(cal.selectedDate)}
          gitEnabled={gitCommits.enabled}
          onNewEvent={() => { cal.setEditEvent(null); cal.setModalOpen(true) }}
          onEditEvent={cal.handleEditEvent}
          onDeleteEvent={cal.handleQuickDelete}
          onNewSport={() => { setEditSport(null); setSportModalOpen(true) }}
          onEditSport={(se) => { setEditSport(se); setSportModalOpen(true) }}
          onDeleteSport={(se) => sport.deleteEntry(se.id)}
        />
      )}

      {/* Event-Modal */}
      {cal.modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          onClick={() => { cal.setModalOpen(false); cal.setEditEvent(null) }}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CalendarEventForm
              data={cal.editEvent ? {
                title: cal.editEvent.title,
                description: cal.editEvent.description || '',
                start_time: cal.editEvent.start_time.slice(0, 16),
                end_time: cal.editEvent.end_time?.slice(0, 16) || cal.editEvent.start_time.slice(0, 16),
                all_day: cal.editEvent.all_day,
                color: cal.editEvent.color,
                recurrence: cal.editEvent.recurrence,
                recurrence_end: cal.editEvent.recurrence_end?.slice(0, 10) || '',
              } : emptyFormData(cal.selectedDate || undefined)}
              isEdit={!!cal.editEvent}
              onSave={cal.handleSave}
              onCancel={() => { cal.setModalOpen(false); cal.setEditEvent(null) }}
              onDelete={cal.editEvent ? cal.handleDelete : undefined}
              readOnly={editingICloud}
              readOnlySource={editingICloud ? `iCloud · ${editingICloudCalName}` : undefined}
              readOnlyLocation={editingICloudLocation}
            />
          </div>
        </div>
      )}

      {/* Sport-Modal */}
      <SportModal
        open={sportModalOpen}
        date={cal.selectedDate || ''}
        initial={editSport ? {
          id: editSport.id,
          sport_type: editSport.sport_type,
          duration_min: editSport.duration_min,
          intensity: editSport.intensity,
          muscle_groups: editSport.muscle_groups || [],
          note: editSport.note || '',
        } : undefined}
        onSave={handleSportSave}
        onDelete={editSport ? handleSportDelete : undefined}
        onClose={() => { setSportModalOpen(false); setEditSport(null) }}
      />
    </div>
  )
}

export default CalendarPage
