// CalendarPage — Hauptkalender mit Monatsansicht
// Route: /calendar (innerhalb Layout mit Sidebar)
// Einzelklick → Tag selektieren (persistent), Doppelklick → Event-Formular
// Hover-Glow wie im Journal-Kalender

import { useState, useEffect, useCallback } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import { get, post, put, del } from '../hooks/useAPI'
import CalendarEventForm, { emptyFormData } from '../components/CalendarEventForm'
import type { EventFormData } from '../components/CalendarEventForm'

// Event-Typ vom Backend
interface CalendarEvent {
  id: number
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  all_day: boolean
  color: string
  recurrence: string
  recurrence_end: string | null
  created_at: string
  updated_at: string
}

// Farb-Map für Event-Punkte (Pastell-Neon)
const COLOR_MAP: Record<string, string> = {
  cyan: '#7dd8e8',
  violet: '#a78bda',
  emerald: '#7dd4a3',
  orange: '#d4a574',
  pink: '#d47d9a',
  yellow: '#d4cc7d',
}

function CalendarPage() {
  const { t } = useLanguage()
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Events für aktuellen Monat laden
  const loadEvents = useCallback(() => {
    get<CalendarEvent[]>(`/api/calendar/events?month=${month}&year=${year}`)
      .then((data) => setEvents(data))
      .catch(() => setEvents([]))
  }, [month, year])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Monat vor/zurück
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Tage im Monat + Offset
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const startOffset = firstWeekday === 0 ? 6 : firstWeekday - 1

  // Events für einen Tag
  const eventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.start_time.startsWith(dateStr))
  }

  // Einzelklick → Tag selektieren (toggle)
  const handleDayClick = (dateStr: string) => {
    setSelectedDate(selectedDate === dateStr ? null : dateStr)
  }

  // Doppelklick → Modal öffnen
  const handleDayDoubleClick = (dateStr: string) => {
    setSelectedDate(dateStr)
    setEditEvent(null)
    setModalOpen(true)
  }

  // Event bearbeiten
  const handleEditEvent = (event: CalendarEvent) => {
    setEditEvent(event)
    setModalOpen(true)
  }

  // Einzelnes Event direkt löschen (aus der Liste)
  const handleQuickDelete = async (event: CalendarEvent) => {
    await del(`/api/calendar/events/${event.id}`)
    loadEvents()
  }

  // Formular speichern
  const handleSave = async (data: EventFormData) => {
    const body = {
      ...data,
      start_time: data.all_day ? `${data.start_time.slice(0, 10)}T00:00:00` : data.start_time,
      end_time: data.end_time
        ? (data.all_day ? `${data.end_time.slice(0, 10)}T23:59:59` : data.end_time)
        : null,
      description: data.description || null,
      recurrence_end: data.recurrence_end || null,
    }
    if (editEvent) {
      await put(`/api/calendar/events/${editEvent.id}`, body)
    } else {
      await post('/api/calendar/events', body)
    }
    setModalOpen(false)
    setEditEvent(null)
    loadEvents()
  }

  // Event löschen (aus Modal)
  const handleDelete = async () => {
    if (!editEvent) return
    await del(`/api/calendar/events/${editEvent.id}`)
    setModalOpen(false)
    setEditEvent(null)
    loadEvents()
  }

  // Heute-Check
  const isToday = (dateStr: string) => dateStr === todayStr

  // Events des selektierten Tages
  const dayEvents = selectedDate
    ? events.filter((e) => e.start_time.startsWith(selectedDate))
    : []

  // Zellen-Style basierend auf State (kein DOM-Manipulation)
  const getCellStyle = (dateStr: string) => {
    const selected = dateStr === selectedDate
    const hovered = dateStr === hoveredDate
    const today = isToday(dateStr)

    if (selected) {
      return {
        backgroundColor: 'var(--color-active-bg)',
        border: '1px solid var(--color-highlight-strong)',
        boxShadow: '0 0 15px var(--color-highlight-glow)',
      }
    }
    if (hovered) {
      return {
        backgroundColor: 'var(--color-hover-bg)',
        border: '1px solid var(--color-highlight-border)',
        boxShadow: '0 0 15px var(--color-glow-soft)',
      }
    }
    if (today) {
      return {
        backgroundColor: 'var(--color-highlight-bg)',
        border: '1px solid var(--color-highlight-border)',
        boxShadow: 'none',
      }
    }
    return {
      backgroundColor: 'rgba(13, 17, 23, 0.3)',
      border: '1px solid transparent',
      boxShadow: 'none',
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Header: Titel + Navigation */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hud-title text-glow text-2xl" style={{ color: 'var(--color-primary)' }}>
          {t.mainCalendar.title}
        </h1>
        <div className="flex items-center gap-3">
          <button className="hud-btn px-3 py-1" onClick={prevMonth}>‹</button>
          <span className="hud-title text-base" style={{ minWidth: '160px', textAlign: 'center' }}>
            {t.mainCalendar.months[month - 1]} {year}
          </span>
          <button className="hud-btn px-3 py-1" onClick={nextMonth}>›</button>
        </div>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {t.mainCalendar.weekdays.map((wd) => (
          <div key={wd} className="text-center text-xs py-2"
            style={{ color: 'var(--color-text-muted)' }}>
            {wd}
          </div>
        ))}
      </div>

      {/* Kalender-Grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-20 rounded-lg" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvts = eventsForDay(day)
          const today = isToday(dateStr)
          const selected = dateStr === selectedDate

          return (
            <div
              key={day}
              onClick={() => handleDayClick(dateStr)}
              onDoubleClick={() => handleDayDoubleClick(dateStr)}
              onMouseEnter={() => setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
              className="h-20 rounded-lg p-1.5 relative transition-all duration-200 cursor-pointer"
              style={getCellStyle(dateStr)}
            >
              <span className="text-xs font-medium" style={{
                color: selected || today ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}>
                {day}
              </span>

              {dayEvts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {dayEvts.slice(0, 4).map((evt) => (
                    <div key={evt.id} className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan,
                        boxShadow: `0 0 6px ${COLOR_MAP[evt.color] || COLOR_MAP.cyan}`,
                      }} />
                  ))}
                  {dayEvts.length > 4 && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.5rem' }}>
                      +{dayEvts.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selektierter Tag: Event-Liste unterhalb */}
      {selectedDate && (
        <div className="mt-6 hud-card p-4 rounded-lg border animate-fade-in"
          style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {new Date(selectedDate + 'T00:00').toLocaleDateString('de-CH', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </span>
            <button className="hud-btn hud-btn-primary text-xs px-3 py-1"
              onClick={() => { setEditEvent(null); setModalOpen(true) }}>
              {t.mainCalendar.newEvent}
            </button>
          </div>
          {dayEvents.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t.mainCalendar.emptyTitle}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {dayEvents.map((evt) => (
                <div key={evt.id}
                  className="flex items-center gap-2 p-2 rounded-md
                    transition-all duration-200 hover:bg-[var(--color-hover-bg)]">
                  {/* Farb-Indikator */}
                  <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan }} />

                  {/* Event-Info (klickbar → bearbeiten) */}
                  <button onClick={() => handleEditEvent(evt)}
                    className="flex-1 min-w-0 text-left">
                    <span className="text-xs block truncate"
                      style={{ color: 'var(--color-text-primary)' }}>{evt.title}</span>
                    {!evt.all_day && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                        {new Date(evt.start_time).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </button>

                  {/* Wiederkehrend-Badge */}
                  {evt.recurrence !== 'none' && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                      color: 'var(--color-text-muted)', backgroundColor: 'var(--color-hover-bg)', fontSize: '0.6rem',
                    }}>↻</span>
                  )}

                  {/* Löschen-Button */}
                  <button
                    onClick={() => handleQuickDelete(evt)}
                    className="flex-shrink-0 p-1 rounded transition-all duration-200
                      hover:bg-[rgba(255,59,92,0.1)]"
                    title={t.mainCalendar.deleteEvent}
                  >
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
      )}

      {/* Modal-Overlay für Event-Formular */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          onClick={() => { setModalOpen(false); setEditEvent(null) }}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CalendarEventForm
              data={editEvent ? {
                title: editEvent.title,
                description: editEvent.description || '',
                start_time: editEvent.start_time.slice(0, 16),
                end_time: editEvent.end_time?.slice(0, 16) || editEvent.start_time.slice(0, 16),
                all_day: editEvent.all_day,
                color: editEvent.color,
                recurrence: editEvent.recurrence,
                recurrence_end: editEvent.recurrence_end?.slice(0, 10) || '',
              } : emptyFormData(selectedDate || undefined)}
              isEdit={!!editEvent}
              onSave={handleSave}
              onCancel={() => { setModalOpen(false); setEditEvent(null) }}
              onDelete={editEvent ? handleDelete : undefined}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage