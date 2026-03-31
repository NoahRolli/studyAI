// CalendarView — Monatskalender für Journal-Einträge + Medikamente
// Einzelklick → Cyan-Umrandung, Doppelklick → Modal
// Grid ausgelagert in CalendarGrid.tsx
// forwardRef: Suche kann von aussen einen Tag öffnen (openDay)

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { MoodResult, JournalEntry, JournalEntryCreate, Medication } from '../../types/models'
import CalendarGrid from './CalendarGrid'
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
  medications: Medication[]
}

// Ref-Handle für externe Steuerung
export interface CalendarViewHandle {
  openDay: (date: string) => void
}

const CalendarView = forwardRef<CalendarViewHandle, CalendarViewProps>(
  function CalendarView({
    moods, moodsLoaded, onLoadMoods,
    entries, editingId, editEntry,
    onStartEdit, onSaveEdit, onCancelEdit, onDelete, onCreateEntry,
    autoTitle, onAutoTitleChange, medEnabled, medications,
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
        const data = await get<CalendarEntry[]>(`/api/journal/calendar/?month=${monthStr}`)
        setCalEntries(data)
      } catch { setCalEntries([]) }
      if (medEnabled) {
        try {
          const med = await get<IntakeCalendarEntry[]>(
            `/api/journal/medications/intake/calendar/${monthStr}`
          )
          setIntakes(med)
        } catch { setIntakes([]) }
      } else { setIntakes([]) }
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

  // Daten-Lookups vorbereiten
  const calByDate: Record<string, CalendarEntry[]> = {}
  for (const e of calEntries) {
    if (!calByDate[e.date]) calByDate[e.date] = []
    calByDate[e.date].push(e)
  }
  const intakeByDate: Record<string, IntakeCalendarEntry[]> = {}
  for (const i of intakes) {
    if (!intakeByDate[i.date]) intakeByDate[i.date] = []
    intakeByDate[i.date].push(i)
  }
  const moodById: Record<number, number> = {}
  for (const m of moods) {
    if (m.score !== undefined) moodById[m.entry_id] = m.score
  }

  const selectedEntries = selectedDate
    ? entries.filter((e) => e.date === selectedDate)
    : []

  return (
    <div className="animate-fade-in">
      {/* Navigation + Mood-Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="hud-btn px-3 py-1">‹</button>
          <span className="hud-title text-base" style={{ minWidth: '160px', textAlign: 'center' }}>
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

      {/* Kalender-Grid (ausgelagert) */}
      <CalendarGrid
        year={year}
        month={month}
        calByDate={calByDate}
        intakeByDate={intakeByDate}
        moodById={moodById}
        moodActive={moodActive}
        selectedDate={selectedDate}
        onDayClick={handleDayClick}
        onDayDoubleClick={handleDayDoubleClick}
      />

      {loading && (
        <p className="text-center mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t.calendar.loading}
        </p>
      )}

      {/* Tag-Modal (Journal + Medikamente) */}
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
          onClose={() => { setModalOpen(false); onCancelEdit() }}
          medEnabled={medEnabled}
          medications={medications}
        />
      )}
    </div>
  )
})

export default CalendarView