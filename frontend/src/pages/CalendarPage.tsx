// CalendarPage — Hauptkalender mit Monatsansicht + Sport-Tracker
// Refaktoriert: State in useCalendarState, Detail in CalendarDayDetail
// Sport-Toggle in localStorage, Sport-Indikator im Grid (grüner Punkt)

import { useState } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import useCalendarState from '../hooks/useCalendarState'
import useSportEntries from '../hooks/useSportEntries'
import CalendarEventForm, { emptyFormData } from '../components/CalendarEventForm'
import CalendarDayDetail from '../components/calendar/CalendarDayDetail'
import SportModal from '../components/sport/SportModal'
import type { SportFormData } from '../components/sport/SportModal'
import type { SportEntry } from '../hooks/useSportEntries'

// Farb-Map für Event-Punkte
const COLOR_MAP: Record<string, string> = {
  cyan: '#7dd8e8', violet: '#a78bda', emerald: '#7dd4a3',
  orange: '#d4a574', pink: '#d47d9a', yellow: '#d4cc7d',
}

function CalendarPage() {
  const { t } = useLanguage()
  const cal = useCalendarState()
  const sport = useSportEntries(cal.month, cal.year)
  const [sportModalOpen, setSportModalOpen] = useState(false)
  const [editSport, setEditSport] = useState<SportEntry | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  // Sport CRUD Handler
  const handleSportSave = async (data: SportFormData) => {
    if (editSport) {
      await sport.updateEntry(editSport.id, data)
    } else if (cal.selectedDate) {
      await sport.createEntry({ ...data, date: cal.selectedDate })
    }
    setSportModalOpen(false)
    setEditSport(null)
  }
  const handleSportDelete = async () => {
    if (!editSport) return
    await sport.deleteEntry(editSport.id)
    setSportModalOpen(false)
    setEditSport(null)
  }

  // Zellen-Style
  const getCellStyle = (dateStr: string) => {
    const selected = dateStr === cal.selectedDate
    const hovered = dateStr === hoveredDate
    const today = cal.isToday(dateStr)
    if (selected) return {
      backgroundColor: 'var(--color-active-bg)',
      border: '1px solid var(--color-highlight-strong)',
      boxShadow: '0 0 15px var(--color-highlight-glow)',
    }
    if (hovered) return {
      backgroundColor: 'var(--color-hover-bg)',
      border: '1px solid var(--color-highlight-border)',
      boxShadow: '0 0 15px var(--color-glow-soft)',
    }
    if (today) return {
      backgroundColor: 'var(--color-highlight-bg)',
      border: '1px solid var(--color-highlight-border)',
      boxShadow: 'none',
    }
    return {
      backgroundColor: 'var(--color-hover-bg)',
      border: '1px solid transparent', boxShadow: 'none',
    }
  }

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
        </div>
        <div className="flex items-center gap-3">
          <button className="hud-btn px-3 py-1" onClick={cal.prevMonth}>‹</button>
          <span className="hud-title text-base"
            style={{ minWidth: '160px', textAlign: 'center' }}>
            {t.mainCalendar.months[cal.month - 1]} {cal.year}
          </span>
          <button className="hud-btn px-3 py-1" onClick={cal.nextMonth}>›</button>
        </div>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {t.mainCalendar.weekdays.map((wd) => (
          <div key={wd} className="text-center text-xs py-2"
            style={{ color: 'var(--color-text-muted)' }}>{wd}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: cal.startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-20 rounded-lg" />
        ))}
        {Array.from({ length: cal.daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${cal.year}-${String(cal.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvts = cal.eventsForDay(day)
          const daySport = sport.forDate(dateStr)
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
                {dayEvts.slice(0, 4).map((evt) => (
                  <div key={evt.id} className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan,
                      boxShadow: `0 0 6px ${COLOR_MAP[evt.color] || COLOR_MAP.cyan}`,
                    }} />
                ))}
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
