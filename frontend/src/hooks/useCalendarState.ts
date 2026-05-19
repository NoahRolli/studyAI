// useCalendarState — Kalender-Events laden, erstellen, bearbeiten, löschen
// Extrahiert aus CalendarPage für Dateigrößen-Limit

import { useState, useEffect, useCallback } from 'react'
import { get, post, put, del } from './useAPI'
import type { EventFormData } from '../components/CalendarEventForm'

// Event-Typ vom Backend
export interface CalendarEvent {
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
  source?: string
  is_readonly?: boolean
  external_calendar_id?: number | null
  location?: string | null
}

export default function useCalendarState() {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Events laden
  const loadEvents = useCallback(() => {
    get<CalendarEvent[]>(`/api/calendar/events?month=${month}&year=${year}`)
      .then((data) => setEvents(data))
      .catch(() => setEvents([]))
  }, [month, year])

  useEffect(() => { loadEvents() }, [loadEvents])

  // Navigation
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Events für einen Tag
  const eventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.start_time.startsWith(dateStr))
  }

  // Klick-Handler
  const handleDayClick = (dateStr: string) => {
    setSelectedDate(selectedDate === dateStr ? null : dateStr)
  }
  const handleDayDoubleClick = (dateStr: string) => {
    setSelectedDate(dateStr)
    setEditEvent(null)
    setModalOpen(true)
  }
  const handleEditEvent = (event: CalendarEvent) => {
    setEditEvent(event)
    setModalOpen(true)
  }

  // CRUD
  const handleSave = async (data: EventFormData) => {
    const body = {
      ...data,
      start_time: data.all_day
        ? `${data.start_time.slice(0, 10)}T00:00:00` : data.start_time,
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

  const handleDelete = async () => {
    if (!editEvent) return
    await del(`/api/calendar/events/${editEvent.id}`)
    setModalOpen(false)
    setEditEvent(null)
    loadEvents()
  }

  const handleQuickDelete = async (event: CalendarEvent) => {
    await del(`/api/calendar/events/${event.id}`)
    loadEvents()
  }

  // Berechnete Werte
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const startOffset = firstWeekday === 0 ? 6 : firstWeekday - 1
  const isToday = (dateStr: string) => dateStr === todayStr

  const dayEvents = selectedDate
    ? events.filter((e) => e.start_time.startsWith(selectedDate))
    : []

  return {
    year, month, events, selectedDate, editEvent, modalOpen,
    todayStr, daysInMonth, startOffset, dayEvents,
    setSelectedDate, setEditEvent, setModalOpen,
    prevMonth, nextMonth, eventsForDay, isToday,
    handleDayClick, handleDayDoubleClick, handleEditEvent,
    handleSave, handleDelete, handleQuickDelete, loadEvents,
  }
}
