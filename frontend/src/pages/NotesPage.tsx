// NotesPage — Orchestrator für das Notizen-Modul
// Verwaltet State und API-Calls, delegiert Anzeige an Komponenten
// Links: NotesList (Suche, Liste, Aktionen, Pin-Toggle)
// Rechts: NoteEditor + BacklinksPanel + NoteAIPanel
// Cmd+K: QuickSwitcher Modal für schnelle Navigation

import { useState, useEffect, useRef, useCallback } from 'react'
import { get, post, put, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import NotesList from '../components/notes/NotesList'
import NoteEditor from '../components/notes/NoteEditor'
import BacklinksPanel from '../components/notes/BacklinksPanel'
import NoteAIPanel from '../components/notes/NoteAIPanel'
import QuickSwitcher from '../components/notes/QuickSwitcher'

// Notiz-Typ für die Liste (ohne Content)
interface NoteListItem {
  id: number
  title: string
  is_pinned?: boolean
  updated_at: string
  created_at: string
}

// Volle Notiz mit Content
interface NoteDetail extends NoteListItem {
  content: string
}

function NotesPage() {
  const { t } = useLanguage()

  // State
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)

  // Auto-Save Timer Ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Cmd+K Keyboard Shortcut ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSwitcher((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // --- API-Aufrufe ---
  async function loadNotes() {
    try {
      const data = await get<NoteListItem[]>('/api/notes')
      setNotes(data)
    } catch { /* Fehler ignorieren */ }
  }

  async function loadNote(id: number) {
    try {
      const data = await get<NoteDetail>(`/api/notes/${id}`)
      setSelectedNote(data)
    } catch { /* Fehler ignorieren */ }
  }

  async function createNote(title?: string) {
    try {
      const data = await post<NoteDetail>('/api/notes', {
        title: title || t.notes.untitled,
        content: '',
      })
      await loadNotes()
      setSelectedNote(data)
      return data
    } catch { /* Fehler ignorieren */ }
  }

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

  async function deleteNote(id: number) {
    if (!confirm(t.notes.deleteConfirm)) return
    try {
      await del(`/api/notes/${id}`)
      if (selectedNote?.id === id) setSelectedNote(null)
      await loadNotes()
    } catch { /* Fehler ignorieren */ }
  }

  // --- Pin Toggle ---
  async function togglePin(id: number) {
    try {
      await put(`/api/notes/${id}/pin`, {})
      await loadNotes()
    } catch { /* Fehler ignorieren */ }
  }

  // --- WikiLink Handler ---
  const handleWikiLinkClick = useCallback(async (title: string) => {
    const existing = notes.find(
      (n) => n.title.toLowerCase() === title.toLowerCase()
    )
    if (existing) {
      await loadNote(existing.id)
    } else {
      await createNote(title)
    }
  }, [notes])

  // --- Auto-Save Handler ---
  function triggerAutoSave(updated: NoteDetail) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(updated), 1000)
  }

  function handleContentChange(content: string) {
    if (!selectedNote) return
    const updated = { ...selectedNote, content }
    setSelectedNote(updated)
    triggerAutoSave(updated)
  }

  function handleTitleChange(title: string) {
    if (!selectedNote) return
    const updated = { ...selectedNote, title }
    setSelectedNote(updated)
    triggerAutoSave(updated)
  }

  // --- Lifecycle ---
  useEffect(() => { loadNotes() }, [])
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [])

  return (
    <div className="animate-fade-in flex gap-6 h-[calc(100vh-3rem)]">
      {/* Linke Spalte: Liste */}
      <NotesList
        notes={notes}
        selectedId={selectedNote?.id ?? null}
        search={search}
        onSearchChange={setSearch}
        onSelectNote={loadNote}
        onCreateNote={() => createNote()}
        onDeleteNote={deleteNote}
        onTogglePin={togglePin}
      />

      {/* Rechte Spalte: Editor + Backlinks + AI */}
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
            <NoteEditor
              title={selectedNote.title}
              content={selectedNote.content}
              saving={saving}
              savedMsg={savedMsg}
              onTitleChange={handleTitleChange}
              onContentChange={handleContentChange}
              onWikiLinkClick={handleWikiLinkClick}
            />
            <BacklinksPanel
              noteId={selectedNote.id}
              onNavigate={loadNote}
            />
            <NoteAIPanel
              noteId={selectedNote.id}
              onNavigate={loadNote}
            />
          </>
        )}
      </div>

      {/* Quick-Switcher Modal (Cmd+K) */}
      {showSwitcher && (
        <QuickSwitcher
          notes={notes}
          onSelect={loadNote}
          onCreate={(title) => createNote(title)}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  )
}

export default NotesPage
