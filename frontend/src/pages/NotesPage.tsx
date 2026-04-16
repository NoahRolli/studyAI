// NotesPage — Orchestrator für das Notizen-Modul
// Mobile: Liste ODER Editor (Vollbild), Desktop: nebeneinander
// Cmd+K: QuickSwitcher Modal für schnelle Navigation

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get, post, put, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import NotesList from '../components/notes/NotesList'
import NoteEditor from '../components/notes/NoteEditor'
import BacklinksPanel from '../components/notes/BacklinksPanel'
import NoteAIPanel from '../components/notes/NoteAIPanel'
import RelationsPanel from '../components/relations/RelationsPanel'
import QuickSwitcher from '../components/notes/QuickSwitcher'

interface NoteListItem {
  id: number; title: string; is_pinned?: boolean
  updated_at: string; created_at: string
}
interface NoteDetail extends NoteListItem { content: string }

function NotesPage() {
  const { t } = useLanguage()
  const [notes, setNotes] = useState<NoteListItem[]>([])
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSwitcher(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // --- API ---
  async function loadNotes() {
    try { setNotes(await get<NoteListItem[]>('/api/notes')) }
    catch { /* ignore */ }
  }

  async function loadNote(id: number) {
    try { setSelectedNote(await get<NoteDetail>(`/api/notes/${id}`)) }
    catch { /* ignore */ }
  }

  async function createNote(title?: string) {
    try {
      const data = await post<NoteDetail>('/api/notes', {
        title: title || t.notes.untitled, content: '',
      })
      await loadNotes()
      setSelectedNote(data)
      return data
    } catch { /* ignore */ }
  }

  const saveNote = useCallback(async (note: NoteDetail) => {
    setSaving(true)
    try {
      await put(`/api/notes/${note.id}`, {
        title: note.title, content: note.content,
      })
      await loadNotes()
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 1500)
    } catch { /* ignore */ }
    setSaving(false)
  }, [])

  async function deleteNote(id: number) {
    if (!confirm(t.notes.deleteConfirm)) return
    try {
      await del(`/api/notes/${id}`)
      if (selectedNote?.id === id) setSelectedNote(null)
      await loadNotes()
    } catch { /* ignore */ }
  }

  async function togglePin(id: number) {
    try { await put(`/api/notes/${id}/pin`, {}); await loadNotes() }
    catch { /* ignore */ }
  }

  const handleWikiLinkClick = useCallback(async (title: string) => {
    const existing = notes.find(
      n => n.title.toLowerCase() === title.toLowerCase()
    )
    if (existing) await loadNote(existing.id)
    else await createNote(title)
  }, [notes])

  // --- Auto-Save ---
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

  // Zurueck zur Liste (Mobile)
  function handleBack() {
    // Auto-Save auslösen falls pending
    if (saveTimer.current && selectedNote) {
      clearTimeout(saveTimer.current)
      saveNote(selectedNote)
    }
    setSelectedNote(null)
  }

  // --- Lifecycle ---
  useEffect(() => { loadNotes() }, [])
  useEffect(() => {
    const openId = searchParams.get("open")
    if (openId) {
      loadNote(Number(openId))
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [])

  return (
    <div className="animate-fade-in flex gap-0 md:gap-6 h-[calc(100vh-3rem)]">
      {/* Liste: auf Mobile nur sichtbar wenn keine Note ausgewaehlt */}
      <div className={`${selectedNote ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-72 md:flex-shrink-0`}>
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
      </div>

      {/* Editor: auf Mobile nur sichtbar wenn Note ausgewaehlt */}
      <div className={`${selectedNote ? 'flex' : 'hidden md:flex'} flex-1 flex-col hud-card overflow-hidden`}
        style={{ minHeight: 0 }}>
        {!selectedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ color: 'var(--color-text-muted)' }}>
              {t.notes.noNoteSelected}
            </p>
          </div>
        ) : (
          <>
            {/* Zurueck-Button nur auf Mobile */}
            <button onClick={handleBack}
              className="md:hidden flex items-center gap-1 px-3 py-2 text-sm"
              style={{ color: 'var(--color-primary)' }}>
              ← {t.common.back}
            </button>
            <NoteEditor
              title={selectedNote.title}
              content={selectedNote.content}
              saving={saving}
              savedMsg={savedMsg}
              onTitleChange={handleTitleChange}
              onContentChange={handleContentChange}
              onWikiLinkClick={handleWikiLinkClick}
            />
            <BacklinksPanel noteId={selectedNote.id} onNavigate={loadNote} />
            <NoteAIPanel noteId={selectedNote.id} onNavigate={loadNote} />
            <RelationsPanel noteId={selectedNote.id} onNavigate={loadNote} />
          </>
        )}
      </div>

      {showSwitcher && (
        <QuickSwitcher
          notes={notes}
          onSelect={loadNote}
          onCreate={title => createNote(title)}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  )
}

export default NotesPage
