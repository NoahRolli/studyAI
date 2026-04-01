// NotesPage — Notizen-Modul mit Liste + Markdown-Editor
// Links: Notiz-Liste mit Suche und Neu-Button
// Rechts: Editor für ausgewählte Notiz (Titel + Content)
// Auto-Save nach 1 Sekunde Tipp-Pause
// [[Link]] Syntax für Verlinkung zwischen Notizen

import { useState, useEffect, useRef, useCallback } from 'react'
import { get, post, put, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'

// Notiz-Typ für die Liste (ohne Content)
interface NoteListItem {
  id: number
  title: string
  updated_at: string
  created_at: string
}

// Volle Notiz mit Content
interface NoteDetail extends NoteListItem {
  content: string
}

function NotesPage() {
  const { t } = useLanguage()

  // State: Liste, ausgewählte Notiz, Suche
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  // Auto-Save Timer Ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Notizen laden
  async function loadNotes() {
    try {
      const data = await get('/api/notes')
      setNotes(data)
    } catch { /* Fehler ignorieren */ }
  }

  // Einzelne Notiz laden
  async function loadNote(id: number) {
    try {
      const data = await get(`/api/notes/${id}`)
      setSelectedNote(data)
    } catch { /* Fehler ignorieren */ }
  }

  // Neue Notiz erstellen
  async function createNote() {
    try {
      const data = await post('/api/notes', {
        title: t.notes.untitled,
        content: '',
      })
      await loadNotes()
      setSelectedNote(data)
    } catch { /* Fehler ignorieren */ }
  }

  // Notiz speichern (Auto-Save)
  const saveNote = useCallback(async (note: NoteDetail) => {
    setSaving(true)
    try {
      await put(`/api/notes/${note.id}`, {
        title: note.title,
        content: note.content,
      })
      await loadNotes()
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 1500)
    } catch { /* Fehler ignorieren */ }
    setSaving(false)
  }, [])

  // Notiz löschen
  async function deleteNote(id: number) {
    if (!confirm(t.notes.deleteConfirm)) return
    try {
      await del(`/api/notes/${id}`)
      if (selectedNote?.id === id) setSelectedNote(null)
      await loadNotes()
    } catch { /* Fehler ignorieren */ }
  }

  // Auto-Save: 1 Sekunde nach letztem Tastendruck
  function handleContentChange(content: string) {
    if (!selectedNote) return
    const updated = { ...selectedNote, content }
    setSelectedNote(updated)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(updated), 1000)
  }

  // Titel ändern + Auto-Save
  function handleTitleChange(title: string) {
    if (!selectedNote) return
    const updated = { ...selectedNote, title }
    setSelectedNote(updated)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(updated), 1000)
  }

  // Suche filtern
  const filtered = search.trim()
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(search.toLowerCase())
      )
    : notes

  // Beim Mount laden
  useEffect(() => { loadNotes() }, [])

  // Timer aufräumen
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  return (
    <div className="animate-fade-in flex gap-6 h-[calc(100vh-3rem)]">

      {/* Linke Spalte: Liste */}
      <div
        className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-hidden"
      >
        {/* Header: Titel + Neu-Button */}
        <div className="flex items-center justify-between">
          <h1 className="hud-title text-glow text-2xl">{t.notes.title}</h1>
          <button onClick={createNote} className="hud-btn hud-btn-primary text-sm">
            + {t.notes.newNote}
          </button>
        </div>

        {/* Suchfeld */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
              onClick={() => loadNote(note.id)}
              className={`group flex items-center justify-between px-3 py-2
                rounded-md cursor-pointer transition-all duration-200
                ${selectedNote?.id === note.id
                  ? 'bg-[rgba(0,212,255,0.1)] border border-[var(--color-border-glow)]'
                  : 'hover:bg-[rgba(0,212,255,0.05)] border border-transparent'
                }`}
            >
              <span
                className="text-sm truncate"
                style={{
                  color: selectedNote?.id === note.id
                    ? 'var(--color-primary)'
                    : 'var(--color-text-secondary)',
                }}
              >
                {note.title}
              </span>
              {/* Löschen-Button (X) */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
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

      {/* Rechte Spalte: Editor */}
      <div
        className="flex-1 flex flex-col hud-card overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {!selectedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ color: 'var(--color-text-muted)' }}>
              {t.notes.noNoteSelected}
            </p>
          </div>
        ) : (
          <>
            {/* Titel-Eingabe */}
            <input
              type="text"
              value={selectedNote.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="bg-transparent border-none outline-none text-xl font-bold
                mb-4 px-1"
              style={{
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-heading)',
              }}
            />

            {/* Markdown-Editor (Textarea) */}
            <textarea
              value={selectedNote.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="[[Link zu anderer Notiz]]..."
              className="flex-1 bg-transparent border-none outline-none resize-none
                text-sm leading-relaxed px-1"
              style={{
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            />

            {/* Status-Zeile */}
            <div
              className="flex items-center justify-end pt-2 mt-2 border-t text-xs"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              {saving && 'Saving...'}
              {savedMsg && !saving && t.notes.saved}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default NotesPage
