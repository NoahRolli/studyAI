// JournalSearch — Globale Schlagwort-Suche über alle Journal-Einträge
// Durchsucht Titel + Content, zeigt Treffer als Dropdown
// Klick auf Treffer → Callback an Journal.tsx (Tab-Wechsel + Modal)

import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type { JournalEntry } from '../../types/models'

interface JournalSearchProps {
  entries: JournalEntry[]
  onSelectEntry: (entry: JournalEntry) => void
}

// Kurzes Snippet um das Keyword herum extrahieren
function getSnippet(text: string, query: string, maxLen = 60): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '...' : '')
  const start = Math.max(0, idx - 20)
  const end = Math.min(text.length, idx + query.length + 40)
  let snippet = ''
  if (start > 0) snippet += '...'
  snippet += text.slice(start, end)
  if (end < text.length) snippet += '...'
  return snippet
}

function JournalSearch({ entries, onSelectEntry }: JournalSearchProps) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Dropdown schliessen bei Klick ausserhalb
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtern: Titel oder Content enthält Query (case-insensitive)
  const trimmed = query.trim().toLowerCase()
  const results = trimmed.length < 2
    ? []
    : entries.filter(
        (e) =>
          e.title.toLowerCase().includes(trimmed) ||
          e.content.toLowerCase().includes(trimmed)
      )

  // Treffer auswählen → Callback + Suche schliessen
  function handleSelect(entry: JournalEntry) {
    onSelectEntry(entry)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Suchfeld */}
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
        placeholder={t.common.search}
        className="hud-input text-xs py-1.5 px-3"
        style={{ width: '180px' }}
      />

      {/* Ergebnis-Dropdown */}
      {open && trimmed.length >= 2 && (
        <div
          className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg z-50"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-highlight-border)',
            boxShadow: '0 0 20px var(--color-glow-soft)',
          }}
        >
          {results.length === 0 ? (
            <div
              className="px-3 py-3 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t.common.noResults} "{query}"
            </div>
          ) : (
            results.map((entry) => {
              const inTitle = entry.title.toLowerCase().includes(trimmed)
              const snippet = inTitle
                ? entry.title
                : getSnippet(entry.content, trimmed)
              return (
                <button
                  key={entry.id}
                  onClick={() => handleSelect(entry)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-xs"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {entry.date}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {entry.title}
                    </span>
                  </div>
                  {!inTitle && (
                    <p
                      className="text-xs truncate"
                      style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}
                    >
                      {snippet}
                    </p>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default JournalSearch