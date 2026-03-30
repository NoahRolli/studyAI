// CalendarPage — Hauptkalender mit Monatsansicht
// Route: /calendar (innerhalb Layout mit Sidebar)
// Zeigt Monatsraster mit Events, Navigation und Event-Formular

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

// Farb-Map für Event-Punkte
const COLOR_MAP: Record<string, string> = {
  cyan: 'var(--color-primary)',
  violet: '#8b5cf6',
  emerald: '#10b981',
  orange: '#f59e0b',
  pink: '#ec4899',
  yellow: '#eab308',
}

function CalendarPage() {
  const { t } = useLanguage()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Events für aktuellen Monat laden
  const loadEvents = useCallback(() => {
    get<CalendarEvent[]>(`/api/calendar/events?month=${month}&year=${year}`)
      .then((data) => setEvents(data))
      .catch(() => setEvents([]))
  }, [month, year])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Monat vor/zurück navigieren
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Tage im Monat berechnen
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  // Montag = 0, Sonntag = 6 (europäisches Format)
  const startOffset = firstWeekday === 0 ? 6 : firstWeekday - 1

  // Events für einen bestimmten Tag filtern
  const eventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.start_time.startsWith(dateStr))
  }

  // Tag klicken → Events anzeigen / Formular öffnen
  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDate(dateStr)
    setEditEvent(null)
    setShowForm(false)
  }

  // Neues Event erstellen
  const handleCreate = () => {
    setEditEvent(null)
    setShowForm(true)
  }

  // Event bearbeiten
  const handleEdit = (event: CalendarEvent) => {
    setEditEvent(event)
    setShowForm(true)
  }

  // Formular speichern (Erstellen oder Update)
  const handleSave = async (data: EventFormData) => {
    const body = {
      ...data,
      start_time: data.all_day ? `${data.start_time.slice(0, 10)}T00:00:00` : data.start_time,
      end_time: data.end_time ? (data.all_day ? `${data.end_time.slice(0, 10)}T23:59:59` : data.end_time) : null,
      description: data.description || null,
      recurrence_end: data.recurrence_end || null,
    }
    if (editEvent) {
      await put(`/api/calendar/events/${editEvent.id}`, body)
    } else {
      await post('/api/calendar/events', body)
    }
    setShowForm(false)
    setEditEvent(null)
    loadEvents()
  }

  // Event löschen
  const handleDelete = async () => {
    if (!editEvent) return
    await del(`/api/calendar/events/${editEvent.id}`)
    setShowForm(false)
    setEditEvent(null)
    loadEvents()
  }

  // Heute-Marker prüfen
  const isToday = (day: number) =>
    year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()

  // Events des ausgewählten Tages
  const dayEvents = selectedDate
    ? events.filter((e) => e.start_time.startsWith(selectedDate))
    : []

  return (
    <div className="animate-fade-in">
      {/* Header: Titel + Monat-Navigation */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hud-title text-glow text-lg" style={{ color: 'var(--color-primary)' }}>
          {t.mainCalendar.title}
        </h1>
        <div className="flex items-center gap-3">
          <button className="hud-btn text-xs px-3 py-1.5" onClick={prevMonth}>←</button>
          <span className="text-sm font-medium min-w-[140px] text-center"
            style={{ color: 'var(--color-text-primary)' }}>
            {t.mainCalendar.months[month - 1]} {year}
          </span>
          <button className="hud-btn text-xs px-3 py-1.5" onClick={nextMonth}>→</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monatsraster (2 Spalten breit) */}
        <div className="lg:col-span-2">
          {/* Wochentag-Header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {t.mainCalendar.weekdays.map((wd) => (
              <div key={wd} className="text-center text-xs py-1"
                style={{ color: 'var(--color-text-muted)' }}>
                {wd}
              </div>
            ))}
          </div>

          {/* Tagesraster */}
          <div className="grid grid-cols-7 gap-1">
            {/* Leere Zellen vor dem 1. */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16" />
            ))}

            {/* Tage des Monats */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayEvts = eventsForDay(day)
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isSelected = selectedDate === dateStr

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className="h-16 rounded-md border p-1 flex flex-col items-start
                    transition-all duration-200 hover:border-[var(--color-primary)]"
                  style={{
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: isSelected ? 'rgba(0,212,255,0.05)' : 'transparent',
                  }}
                >
                  <span className={`text-xs font-medium ${isToday(day) ? 'text-glow' : ''}`}
                    style={{ color: isToday(day) ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                    {day}
                  </span>
                  {/* Event-Punkte (max. 3 sichtbar) */}
                  <div className="flex gap-0.5 mt-auto flex-wrap">
                    {dayEvts.slice(0, 3).map((evt) => (
                      <div key={evt.id} className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan }} />
                    ))}
                    {dayEvts.length > 3 && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.5rem' }}>
                        +{dayEvts.length - 3}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Seitenpanel: Tages-Events oder Formular */}
        <div className="flex flex-col gap-4">
          {showForm ? (
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
              onCancel={() => { setShowForm(false); setEditEvent(null) }}
              onDelete={editEvent ? handleDelete : undefined}
            />
          ) : (
            <div className="hud-card p-4 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
              {selectedDate ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {new Date(selectedDate + 'T00:00').toLocaleDateString('de-CH', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </span>
                    <button className="hud-btn hud-btn-primary text-xs px-3 py-1" onClick={handleCreate}>
                      +
                    </button>
                  </div>
                  {dayEvents.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {t.mainCalendar.emptyTitle}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {dayEvents.map((evt) => (
                        <button key={evt.id} onClick={() => handleEdit(evt)}
                          className="flex items-center gap-2 p-2 rounded-md text-left w-full
                            transition-all duration-200 hover:bg-[rgba(0,212,255,0.05)]">
                          <div className="w-1.5 h-8 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COLOR_MAP[evt.color] || COLOR_MAP.cyan }} />
                          <div className="min-w-0">
                            <span className="text-xs block truncate" style={{ color: 'var(--color-text-primary)' }}>
                              {evt.title}
                            </span>
                            {!evt.all_day && (
                              <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                                {new Date(evt.start_time).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
                  {t.mainCalendar.emptyHint}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalendarPage