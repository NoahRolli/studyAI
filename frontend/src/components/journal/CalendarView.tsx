// CalendarView — Monatskalender für Journal-Einträge
// Einzelklick → Cyan-Umrandung (Selektion)
// Doppelklick → Modal öffnet sich (CalendarDayModal)
// Zukunfts-Tage nicht klickbar. Mood-Toggle: Glow + Opacity.

import { useState, useEffect } from 'react'
import { get } from '../../hooks/useAPI'
import type { MoodResult, JournalEntry, JournalEntryCreate } from '../../types/models'
import CalendarDayModal from './CalendarDayModal'

// Kalender-Eintrag vom Backend (kein Content!)
interface CalendarEntry {
  id: number
  title: string
  date: string
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
function getMoodStyle(score: number | undefined, moodActive: boolean) {
  if (!moodActive || score === undefined) {
    return { opacity: 0.7, glow: '0 0 6px var(--color-primary)' }
  }
  const normalizedOpacity = 0.2 + ((score + 1) / 2) * 0.8
  const glowSize = Math.round(4 + ((score + 1) / 2) * 12)
  return {
    opacity: normalizedOpacity,
    glow: `0 0 ${glowSize}px var(--color-primary)`,
  }
}

// Monatsname für Header
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function CalendarView({
  moods, moodsLoaded, onLoadMoods,
  entries, editingId, editEntry,
  onStartEdit, onSaveEdit, onCancelEdit, onDelete, onCreateEntry,
  autoTitle, onAutoTitleChange,
}: CalendarViewProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [calEntries, setCalEntries] = useState<CalendarEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [moodActive, setMoodActive] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const todayStr = today.toISOString().split('T')[0]

  // Kalender-Einträge laden wenn Monat wechselt
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
      } finally {
        setLoading(false)
      }
    }
    load()
    setSelectedDate(null)
    setModalOpen(false)
  }, [monthStr])

  // Mood laden wenn Toggle an
  useEffect(() => {
    if (moodActive && !moodsLoaded) onLoadMoods()
  }, [moodActive, moodsLoaded, onLoadMoods])

  // Monat navigieren
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  // Einzelklick → Cyan-Umrandung
  function handleDayClick(dateStr: string) {
    if (dateStr > todayStr) return
    setSelectedDate(selectedDate === dateStr ? null : dateStr)
  }

  // Doppelklick → Modal öffnen
  function handleDayDoubleClick(dateStr: string) {
    if (dateStr > todayStr) return
    setSelectedDate(dateStr)
    onCancelEdit()
    setModalOpen(true)
  }

  // Modal schliessen — Selektion bleibt
  function closeModal() {
    setModalOpen(false)
    onCancelEdit()
  }

  // Grid-Daten
  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOffset = getFirstDayOffset(year, month)

  // Kalender-Einträge nach Datum gruppieren
  const calByDate: Record<string, CalendarEntry[]> = {}
  for (const e of calEntries) {
    if (!calByDate[e.date]) calByDate[e.date] = []
    calByDate[e.date].push(e)
  }

  // Mood nach Entry-ID
  const moodById: Record<number, number> = {}
  for (const m of moods) {
    if (m.score !== undefined) moodById[m.entry_id] = m.score
  }

  // Vollständige Einträge für den selektierten Tag
  const selectedEntries = selectedDate
    ? entries.filter((e) => e.date === selectedDate)
    : []

  return (
    <div className="animate-fade-in">
      {/* Navigation + Mood-Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="hud-btn px-3 py-1">‹</button>
          <span
            className="hud-title text-base"
            style={{ minWidth: '160px', textAlign: 'center' }}
          >
            {MONTH_NAMES[month]} {year}
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
            Mood-Glow
          </span>
        </label>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((d) => (
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
            </div>
          )
        })}
      </div>

      {loading && (
        <p className="text-center mt-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Kalender wird geladen...
        </p>
      )}

      {/* Modal — nur bei Doppelklick */}
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
}

export default CalendarView