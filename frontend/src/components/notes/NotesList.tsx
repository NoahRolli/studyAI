// NotesList — Linke Spalte des Notizen-Moduls
// Suchfeld, Neu-Button und scrollbare Notiz-Liste
// Ausgewählte Notiz wird visuell hervorgehoben

import { useLanguage } from '../../hooks/useLanguage'

interface NoteListItem {
  id: number
  title: string
  updated_at: string
  created_at: string
}

interface NotesListProps {
  notes: NoteListItem[]
  selectedId: number | null
  search: string
  onSearchChange: (search: string) => void
  onSelectNote: (id: number) => void
  onCreateNote: () => void
  onDeleteNote: (id: number) => void
}

function NotesList({
  notes, selectedId, search, onSearchChange,
  onSelectNote, onCreateNote, onDeleteNote,
}: NotesListProps) {
  const { t } = useLanguage()

  // Suche filtern
  const filtered = search.trim()
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(search.toLowerCase())
      )
    : notes

  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
      {/* Header: Titel + Neu-Button */}
      <div className="flex items-center justify-between">
        <h1 className="hud-title text-glow text-2xl">{t.notes.title}</h1>
        <button onClick={onCreateNote} className="hud-btn hud-btn-primary text-sm">
          + {t.notes.newNote}
        </button>
      </div>

      {/* Suchfeld */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t.notes.searchPlaceholder}
        className="hud-input text-sm"
      />

      {/* Notiz-Liste */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1">
        {filtered.length === 0 && (
          <p className="text-sm py-4" style={{ color: 'var(--color-text-muted)' }}>
            {t.notes.noNotes}
          </p>
        )}
        {filtered.map((note) => (
          <div
            key={note.id}
            onClick={() => onSelectNote(note.id)}
            className={`group flex items-center justify-between px-3 py-2
              rounded-md cursor-pointer transition-all duration-200
              ${selectedId === note.id
                ? 'bg-[rgba(0,212,255,0.1)] border border-[var(--color-border-glow)]'
                : 'hover:bg-[rgba(0,212,255,0.05)] border border-transparent'
              }`}
          >
            <span
              className="text-sm truncate"
              style={{
                color: selectedId === note.id
                  ? 'var(--color-primary)'
                  : 'var(--color-text-secondary)',
              }}
            >
              {note.title}
            </span>
            {/* Löschen-Button (X) */}
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id) }}
              className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5
                rounded transition-all duration-200
                text-[var(--color-text-muted)] hover:text-[var(--color-danger)]
                hover:bg-[rgba(255,59,92,0.1)]"
            >
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default NotesList
