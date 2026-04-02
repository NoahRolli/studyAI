// QuickSwitcher — Cmd+K Modal für schnelle Notiz-Navigation
// Durchsucht Titel UND Content via Backend-API (Volltext)
// Enter oder Klick öffnet die Notiz, Escape schliesst das Modal
// Pfeil-Tasten für Navigation in der Liste
// Debounce: 200ms nach letztem Tastendruck

import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import { get } from '../../hooks/useAPI'

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
  const [results, setResults] = useState<NoteListItem[]>(notes)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autofokus beim Öffnen
  useEffect(() => { inputRef.current?.focus() }, [])

  // Volltext-Suche mit Debounce via Backend
  useEffect(() => {
    if (!query.trim()) {
      setResults(notes)
      setActiveIdx(0)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await get<NoteListItem[]>(
          `/api/notes/search?q=${encodeURIComponent(query)}`
        )
        setResults(data)
        setActiveIdx(0)
      } catch {
        setResults([])
      }
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, notes])

  // Tastatur-Navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results.length > 0) {
        onSelect(results[activeIdx].id)
      } else if (query.trim()) {
        onCreate(query.trim())
      }
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
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
          onChange={(e) => setQuery(e.target.value)}
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
          {results.map((note, idx) => (
            <button
              key={note.id}
              onClick={() => { onSelect(note.id); onClose() }}
              className="w-full text-left px-4 py-2.5 text-sm transition-all
                duration-150"
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
          {results.length === 0 && query.trim() && (
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
