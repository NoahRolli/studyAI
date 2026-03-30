// CalendarEventForm — Formular zum Erstellen/Bearbeiten von Kalender-Events
// Wird als Modal in CalendarPage eingeblendet
// Unterstützt: Titel, Beschreibung, Start/End, ganztägig, Farbe, Wiederholung

import { useState, useEffect } from 'react'
import { useLanguage } from '../hooks/useLanguage'

// Event-Daten für Erstellen/Bearbeiten
export interface EventFormData {
  title: string
  description: string
  start_time: string
  end_time: string
  all_day: boolean
  color: string
  recurrence: string
  recurrence_end: string
}

// Leeres Formular mit optionalem Vorbelegungsdatum
export function emptyFormData(date?: string): EventFormData {
  const d = date || new Date().toISOString().slice(0, 10)
  return {
    title: '',
    description: '',
    start_time: `${d}T09:00`,
    end_time: `${d}T10:00`,
    all_day: false,
    color: 'cyan',
    recurrence: 'none',
    recurrence_end: '',
  }
}

// Verfügbare Farben mit CSS-Werten
const COLORS = [
  { key: 'cyan', value: 'var(--color-primary)' },
  { key: 'violet', value: '#8b5cf6' },
  { key: 'emerald', value: '#10b981' },
  { key: 'orange', value: '#f59e0b' },
  { key: 'pink', value: '#ec4899' },
  { key: 'yellow', value: '#eab308' },
]

interface Props {
  data: EventFormData
  isEdit: boolean
  onSave: (data: EventFormData) => void
  onCancel: () => void
  onDelete?: () => void
}

function CalendarEventForm({ data, isEdit, onSave, onCancel, onDelete }: Props) {
  const { t } = useLanguage()
  const [form, setForm] = useState<EventFormData>(data)

  // Formular aktualisieren wenn sich die Props ändern (z.B. anderes Event)
  useEffect(() => setForm(data), [data])

  // Feld-Update Helfer
  const set = (key: keyof EventFormData, val: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  // Formular absenden
  const handleSubmit = () => {
    if (!form.title.trim()) return
    onSave(form)
  }

  return (
    <div
      className="hud-card p-5 rounded-lg border animate-fade-in"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Titel */}
      <h3
        className="hud-title text-sm text-glow mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {isEdit ? t.mainCalendar.editEvent : t.mainCalendar.newEvent}
      </h3>

      <div className="flex flex-col gap-3">
        {/* Event-Titel */}
        <input
          className="hud-input text-xs px-3 py-2 rounded"
          placeholder={t.mainCalendar.eventTitlePlaceholder}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />

        {/* Beschreibung */}
        <input
          className="hud-input text-xs px-3 py-2 rounded"
          placeholder={t.mainCalendar.descriptionPlaceholder}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />

        {/* Ganztägig Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => set('all_day', e.target.checked)}
            className="accent-[var(--color-primary)]"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t.mainCalendar.allDay}
          </span>
        </label>

        {/* Start- und Endzeit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
              {t.mainCalendar.startTime}
            </label>
            <input
              type={form.all_day ? 'date' : 'datetime-local'}
              className="hud-input text-xs px-3 py-2 rounded w-full"
              value={form.all_day ? form.start_time.slice(0, 10) : form.start_time}
              onChange={(e) => set('start_time', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
              {t.mainCalendar.endTime}
            </label>
            <input
              type={form.all_day ? 'date' : 'datetime-local'}
              className="hud-input text-xs px-3 py-2 rounded w-full"
              value={form.all_day ? form.end_time.slice(0, 10) : form.end_time}
              onChange={(e) => set('end_time', e.target.value)}
            />
          </div>
        </div>

        {/* Farb-Auswahl */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
            {t.mainCalendar.color}
          </label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => set('color', c.key)}
                className="w-6 h-6 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: c.value,
                  outline: form.color === c.key ? '2px solid var(--color-primary)' : 'none',
                  outlineOffset: '2px',
                  opacity: form.color === c.key ? 1 : 0.5,
                }}
                title={t.mainCalendar.colors[c.key as keyof typeof t.mainCalendar.colors]}
              />
            ))}
          </div>
        </div>

        {/* Wiederholung */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
              {t.mainCalendar.recurrence}
            </label>
            <select
              className="hud-input text-xs px-3 py-2 rounded w-full"
              value={form.recurrence}
              onChange={(e) => set('recurrence', e.target.value)}
            >
              {Object.entries(t.mainCalendar.recurrenceTypes).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          {form.recurrence !== 'none' && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
                {t.mainCalendar.recurrenceEnd}
              </label>
              <input
                type="date"
                className="hud-input text-xs px-3 py-2 rounded w-full"
                value={form.recurrence_end}
                onChange={(e) => set('recurrence_end', e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-2">
          <button className="hud-btn hud-btn-primary text-xs px-4 py-2" onClick={handleSubmit}>
            {t.common.save}
          </button>
          <button className="hud-btn text-xs px-4 py-2" onClick={onCancel}>
            {t.common.cancel}
          </button>
          {isEdit && onDelete && (
            <button className="hud-btn hud-btn-danger text-xs px-4 py-2 ml-auto" onClick={onDelete}>
              {t.common.delete}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalendarEventForm