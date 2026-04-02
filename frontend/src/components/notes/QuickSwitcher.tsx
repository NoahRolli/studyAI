// QuickSwitcher — Cmd+K Modal für schnelle Notiz-Navigation
// Suchfeld mit Echtzeit-Filterung der Notizen
// Enter oder Klick öffnet die Notiz, Escape schliesst das Modal
// Pfeil-Tasten für Navigation in der Liste

import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../../hooks/useLanguage'

interface NoteListItem {
  id: number
  title: string
}

interface QuickSwitcherProps {
  notes: NoteListItem[]
  onSelect: (id: number) => void
  onCreate: (title: string) => void
  onClose: () => void
}

function QuickSwitcher({ notes, onSelect, onCreate, onClose }: QuickSwitcherProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofokus beim Öffnen
  useEffect(() => { inputRef.current?.focus() }, [])

  // Gefilterte Notizen
  const filtered = query.trim()
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(query.toLowerCase())
      )
    : notes

  // Aktiven Index begrenzen wenn sich die Liste ändert
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(Math.max(0, filtered.length - 1))
  }, [filtered.length, activeIdx])

  // Tastatur-Navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0) {
        onSelect(filtered[activeIdx].id)
      } else if (query.trim()) {
        // Keine Treffer → neue Notiz mit dem Suchbegriff erstellen
        onCreate(query.trim())
      }
      onClose()
    }
  }

  return (
    // Backdrop — Klick ausserhalb schliesst das Modal
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="w-full max-w-md rounded-lg border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-glow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Suchfeld */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
          onKeyDown={handleKeyDown}
          placeholder={t.notes.searchPlaceholder}
          className="w-full px-4 py-3 bg-transparent border-b outline-none text-sm"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />

        {/* Ergebnis-Liste */}
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((note, idx) => (
            <button
              key={note.id}
              onClick={() => { onSelect(note.id); onClose() }}
              className="w-full text-left px-4 py-2.5 text-sm transition-all duration-150"
              style={{
                color: idx === activeIdx
                  ? 'var(--color-primary)'
                  : 'var(--color-text-secondary)',
                backgroundColor: idx === activeIdx
                  ? 'rgba(0, 212, 255, 0.1)'
                  : 'transparent',
              }}
            >
              {note.title}
            </button>
          ))}
          {/* Keine Treffer → Notiz erstellen */}
          {filtered.length === 0 && query.trim() && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Enter: "{query.trim()}" erstellen
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuickSwitcher
