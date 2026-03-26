// CalendarView — Monatskalender für Journal-Einträge + Medikamente
// Einzelklick → Cyan-Umrandung, Doppelklick → Modal
// Mood-Toggle: Glow + Opacity. Med-Pillen: grün/rot pro Tag.
// forwardRef: Suche kann von aussen einen Tag öffnen (openDay)

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { MoodResult, JournalEntry, JournalEntryCreate } from '../../types/models'
import CalendarDayModal from './CalendarDayModal'

// Kalender-Eintrag vom Backend (kein Content!)
interface CalendarEntry {
  id: number
  title: string
  date: string
}

// Medikamenten-Einnahme vom Backend
interface IntakeCalendarEntry {
  medication_id: number
  med_name: string
  date: string
  status: 'taken' | 'skipped'
}

// Props — Entry-Aktionen von Journal.tsx
interface CalendarViewProps {
  moods: MoodResult[]
  moodsLoaded: boolean
  onLoadMoods: () => void
  entries: JournalEntry[]
  editingId: number | null
  editEntry: JournalEntryCreate
  onStartEdit: (entry: JournalEntry) => void
  onSaveEdit: (data: JournalEntryCreate) => void
  onCancelEdit: () => void
  onDelete: (id: number) => void
  onCreateEntry: (data: JournalEntryCreate) => void
  autoTitle: boolean
  onAutoTitleChange: (val: boolean) => void
  medEnabled: boolean
}

// Ref-Handle für externe Steuerung
export interface CalendarViewHandle {
  openDay: (date: string) => void
}

// Tage im Monat
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

const CalendarView = forwardRef<CalendarViewHandle, CalendarViewProps>(
  function CalendarView({
    moods, moodsLoaded, onLoadMoods,
    entries, editingId, editEntry,
    onStartEdit, onSaveEdit, onCancelEdit, onDelete, onCreateEntry,
    autoTitle, onAutoTitleChange, medEnabled,
  }, ref) {

  const { t } = useLanguage()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [calEntries, setCalEntries] = useState<CalendarEntry[]>([])
  const [intakes, setIntakes] = useState<IntakeCalendarEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [moodActive, setMoodActive] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const todayStr = today.toISOString().split('T')[0]

  // Externe Steuerung: Suche kann einen Tag öffnen
  useImperativeHandle(ref, () => ({
    openDay(date: string) {
      const [y, m] = date.split('-').map(Number)
      setYear(y)
      setMonth(m - 1)
      setSelectedDate(date)
      setModalOpen(true)
    },
  }))

  // Einträge + Medikamente laden wenn Monat wechselt
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await get<CalendarEntry[]>(
          `/api/journal/calendar/?month=${monthStr}`
        )
        setCalEntries(data)
      } catch {
        setCalEntries([])
      }
      if (medEnabled) {
        try {
          const med = await get<IntakeCalendarEntry[]>(
            `/api/journal/medications/intake/calendar/${monthStr}`
          )
          setIntakes(med)
        } catch {
          setIntakes([])
        }
      } else {
        setIntakes([])
      }
      setLoading(false)
    }
    load()
    setSelectedDate(null)
    setModalOpen(false)
  }, [monthStr, medEnabled])

  // Mood laden wenn Toggle an
  useEffect(() => {
    if (moodActive && !moodsLoaded) onLoadMoods()
  }, [moodActive, moodsLoaded, onLoadMoods])

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  function handleDayClick(dateStr: string) {
    if (dateStr > todayStr) return
    setSelectedDate(selectedDate === dateStr ? null : dateStr)
  }

  function handleDayDoubleClick(dateStr: string) {
    if (dateStr > todayStr) return
    setSelectedDate(dateStr)
    onCancelEdit()
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    onCancelEdit()
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOffset(year, month)

  // Einträge nach Datum
  const calByDate: Record<string, CalendarEntry[]> = {}
  for (const e of calEntries) {
    if (!calByDate[e.date]) calByDate[e.date] = []
    calByDate[e.date].push(e)
  }

  // Medikamenten-Einnahmen nach Datum
  const intakeByDate: Record<string, IntakeCalendarEntry[]> = {}
  for (const i of intakes) {
    if (!intakeByDate[i.date]) intakeByDate[i.date] = []
    intakeByDate[i.date].push(i)
  }

  // Mood nach Entry-ID
  const moodById: Record<number, number> = {}
  for (const m of moods) {
    if (m.score !== undefined) moodById[m.entry_id] = m.score
  }

  const selectedEntries = selectedDate
    ? entries.filter((e) => e.date === selectedDate)
    : []

  return (
    <div className="animate-fade-in">
      {/* Navigation + Toggles */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="hud-btn px-3 py-1">‹</button>
          <span
            className="hud-title text-base"
            style={{ minWidth: '160px', textAlign: 'center' }}
          >
            {t.calendar.months[month]} {year}
          </span>
          <button onClick={nextMonth} className="hud-btn px-3 py-1">›</button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={moodActive}
            onChange={() => setMoodActive(!moodActive)}
            className="w-4 h-4 rounded accent-[var(--color-primary)]"
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t.calendar.moodGlow}
          </span>
        </label>
      </div>

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

      {/* Kalender-Grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="h-20 rounded-lg" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEntries = calByDate[dateStr] || []
          const dayIntakes = intakeByDate[dateStr] || []
          const isToday = dateStr === todayStr
          const isFuture = dateStr > todayStr
          const isSelected = dateStr === selectedDate
          return (
            <div
              key={day}
              onClick={() => handleDayClick(dateStr)}
              onDoubleClick={() => handleDayDoubleClick(dateStr)}
              className={`h-20 rounded-lg p-1.5 relative transition-all duration-200 ${
                isFuture ? 'opacity-30' : 'cursor-pointer'
              }`}
              style={{
                backgroundColor: isSelected
                  ? 'rgba(0, 255, 255, 0.12)'
                  : isToday
                    ? 'rgba(0, 255, 255, 0.06)'
                    : 'rgba(13, 17, 23, 0.3)',
                border: isSelected
                  ? '1px solid rgba(0, 255, 255, 0.5)'
                  : isToday
                    ? '1px solid rgba(0, 255, 255, 0.3)'
                    : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isFuture && !isSelected) {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 255, 255, 0.05)'
                  e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isFuture && !isSelected) {
                  e.currentTarget.style.backgroundColor = isToday
                    ? 'rgba(0, 255, 255, 0.06)'
                    : 'rgba(13, 17, 23, 0.3)'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
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
            </div>
          )
        })}
      </div>

      {loading && (
        <p className="text-center mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t.calendar.loading}
        </p>
      )}

      {/* Modal */}
      {modalOpen && selectedDate && (
        <CalendarDayModal
          selectedDate={selectedDate}
          entries={selectedEntries}
          editingId={editingId}
          editEntry={editEntry}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete}
          onCreateEntry={onCreateEntry}
          autoTitle={autoTitle}
          onAutoTitleChange={onAutoTitleChange}
          onClose={closeModal}
        />
      )}
    </div>
  )
})

export default CalendarView