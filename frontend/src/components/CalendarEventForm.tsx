// CalendarEventForm — Formular zum Erstellen/Bearbeiten von Kalender-Events
// Wird als Modal in CalendarPage eingeblendet
// Unterstützt: Titel, Beschreibung, Start/End, ganztägig, Farbe, Wiederholung
// Farben: Neon-HUD-Style Kästchen. Dropdown: Custom wie ThemeSelector.
//
// Phase 1E: read-only-Mode fuer iCloud-Events
// - Banner oben: "iCloud-Event · <Calendar-Name> · Read-only"
// - Alle Inputs disabled
// - Save/Delete versteckt, nur Cancel/Close

import { useState, useEffect, useRef } from 'react'
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

// Pastell-Neon: Gedämpfte Hologramm-Farben im JARVIS-Style
const COLORS = [
  { key: 'cyan', value: '#7dd8e8', glow: '0 0 12px rgba(125, 216, 232, 0.3)' },
  { key: 'violet', value: '#a78bda', glow: '0 0 12px rgba(167, 139, 218, 0.3)' },
  { key: 'emerald', value: '#7dd4a3', glow: '0 0 12px rgba(125, 212, 163, 0.3)' },
  { key: 'orange', value: '#d4a574', glow: '0 0 12px rgba(212, 165, 116, 0.3)' },
  { key: 'pink', value: '#d47d9a', glow: '0 0 12px rgba(212, 125, 154, 0.3)' },
  { key: 'yellow', value: '#d4cc7d', glow: '0 0 12px rgba(212, 204, 125, 0.3)' },
]

interface Props {
  data: EventFormData
  isEdit: boolean
  onSave: (data: EventFormData) => void
  onCancel: () => void
  onDelete?: () => void
  // Phase 1E: read-only-Props
  readOnly?: boolean
  readOnlySource?: string  // z.B. "iCloud · Privat"
  readOnlyLocation?: string | null
}

function CalendarEventForm({
  data, isEdit, onSave, onCancel, onDelete,
  readOnly = false, readOnlySource, readOnlyLocation,
}: Props) {
  const { t } = useLanguage()
  const [form, setForm] = useState<EventFormData>(data)
  const [recOpen, setRecOpen] = useState(false)
  const recRef = useRef<HTMLDivElement>(null)

  // Formular aktualisieren wenn sich Props ändern
  useEffect(() => setForm(data), [data])

  // Dropdown schliessen bei Klick ausserhalb
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (recRef.current && !recRef.current.contains(e.target as Node)) {
        setRecOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Feld-Update Helfer (no-op bei readOnly)
  const set = (key: keyof EventFormData, val: string | boolean) => {
    if (readOnly) return
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  // Formular absenden (no-op bei readOnly)
  const handleSubmit = () => {
    if (readOnly) return
    if (!form.title.trim()) return
    onSave(form)
  }

  // Aktuelle Wiederholungs-Optionen
  const recOptions = Object.entries(t.mainCalendar.recurrenceTypes) as [string, string][]

  // Style-Helper: bei readOnly alle Inputs visuell gedaempft
  const inputDisabledStyle = readOnly ? {
    opacity: 0.6,
    cursor: 'not-allowed',
    pointerEvents: 'none' as const,
  } : {}

  return (
    <div
      className="hud-card p-5 rounded-lg border animate-fade-in"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Titel */}
      <h3
        className="hud-title text-sm text-glow mb-3"
        style={{ color: 'var(--color-primary)' }}
      >
        {readOnly
          ? (t.mainCalendar.editEvent || 'Event')
          : (isEdit ? t.mainCalendar.editEvent : t.mainCalendar.newEvent)}
      </h3>

      {/* Phase 1E: Read-only-Banner */}
      {readOnly && (
        <div className="mb-4 px-3 py-2 rounded border flex items-center gap-2"
          style={{
            borderColor: 'var(--color-primary)40',
            background: 'var(--color-active-bg)',
            color: 'var(--color-primary)',
          }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ flexShrink: 0 }}>
            <path d="M4 7V5a3 3 0 116 0v2M3 7h8v5H3V7z"
              stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
          <span className="text-xs" style={{ fontSize: '0.7rem' }}>
            {readOnlySource || 'iCloud · Read-only'}
            <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>
              · Bearbeitung im iCloud-Kalender
            </span>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Event-Titel */}
        <input
          className="hud-input text-xs px-3 py-2 rounded"
          placeholder={t.mainCalendar.eventTitlePlaceholder}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          disabled={readOnly}
          style={inputDisabledStyle}
        />

        {/* Beschreibung */}
        <input
          className="hud-input text-xs px-3 py-2 rounded"
          placeholder={t.mainCalendar.descriptionPlaceholder}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={readOnly}
          style={inputDisabledStyle}
        />

        {/* Location nur bei iCloud-Events anzeigen */}
        {readOnly && readOnlyLocation && (
          <div className="text-xs px-3 py-2 rounded"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.7rem',
            }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Ort: </span>
            {readOnlyLocation}
          </div>
        )}

        {/* Ganztägig Toggle */}
        <label className="flex items-center gap-2"
          style={{ cursor: readOnly ? 'not-allowed' : 'pointer' }}>
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => set('all_day', e.target.checked)}
            className="accent-[var(--color-primary)]"
            disabled={readOnly}
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
              disabled={readOnly}
              style={inputDisabledStyle}
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
              disabled={readOnly}
              style={inputDisabledStyle}
            />
          </div>
        </div>

        {/* Neon-Farbauswahl: bei readOnly nur die aktuelle anzeigen */}
        {!readOnly && (
          <div>
            <label className="text-xs mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
              {t.mainCalendar.color}
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => set('color', c.key)}
                  className="w-8 h-8 rounded-md transition-all duration-200"
                  style={{
                    backgroundColor: c.value,
                    opacity: form.color === c.key ? 1 : 0.4,
                    boxShadow: form.color === c.key ? c.glow : 'none',
                    border: form.color === c.key
                      ? `2px solid ${c.value}`
                      : '2px solid transparent',
                    outline: form.color === c.key
                      ? `1px solid ${c.value}`
                      : 'none',
                    outlineOffset: '2px',
                  }}
                  title={t.mainCalendar.colors[c.key as keyof typeof t.mainCalendar.colors]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Wiederholung: nur im Edit-Mode anzeigen */}
        {!readOnly && (
          <div className="grid grid-cols-2 gap-3">
            <div ref={recRef} className="relative">
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
                {t.mainCalendar.recurrence}
              </label>
              <button
                onClick={() => setRecOpen(!recOpen)}
                className="w-full px-3 py-2 rounded text-left text-xs transition-all duration-300 border"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                  borderColor: recOpen ? 'var(--color-border-glow)' : 'var(--color-border)',
                  background: recOpen ? 'var(--color-hover-bg)' : 'var(--color-bg-surface)',
                }}
              >
                {t.mainCalendar.recurrenceTypes[form.recurrence as keyof typeof t.mainCalendar.recurrenceTypes]}
              </button>
              {recOpen && (
                <div
                  className="absolute top-full left-0 mt-1 w-full rounded-md border overflow-hidden animate-fade-in z-50"
                  style={{
                    backgroundColor: 'var(--color-bg-elevated)',
                    borderColor: 'var(--color-border-glow)',
                    boxShadow: '0 0 15px var(--color-glow-medium)',
                  }}
                >
                  {recOptions.map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { set('recurrence', key); setRecOpen(false) }}
                      className="w-full px-3 py-2 text-left transition-all duration-200"
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: '0.65rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: key === form.recurrence ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        background: key === form.recurrence ? 'var(--color-active-bg)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (key !== form.recurrence) e.currentTarget.style.background = 'var(--color-hover-bg)'
                      }}
                      onMouseLeave={(e) => {
                        if (key !== form.recurrence) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {key === form.recurrence && <span style={{ color: 'var(--color-primary)' }}>● </span>}
                      {label}
                    </button>
                  ))}
                </div>
              )}
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
        )}

        {/* Buttons */}
        <div className="flex gap-2 mt-2">
          {!readOnly && (
            <button className="hud-btn hud-btn-primary text-xs px-4 py-2" onClick={handleSubmit}>
              {t.common.save}
            </button>
          )}
          <button className="hud-btn text-xs px-4 py-2" onClick={onCancel}>
            {readOnly ? (t.common.cancel || 'Schliessen') : t.common.cancel}
          </button>
          {isEdit && onDelete && !readOnly && (
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
