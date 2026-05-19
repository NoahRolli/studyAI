// NotesPage — Orchestrator für das Notizen-Modul
// Mobile: Liste ODER Editor, Desktop: nebeneinander
// Fullscreen-Modus: Editor überdeckt alles (Sidebar, Liste)
// Cmd+K: QuickSwitcher Modal

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get, post, put, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import { useHighlight } from '../hooks/useHighlight'
import HighlightDismissBanner from '../components/HighlightDismissBanner'
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
  const [fullscreen, setFullscreen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSwitcher(v => !v)
      }
      // Escape beendet Fullscreen
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreen])

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
      if (selectedNote?.id === id) { setSelectedNote(null); setFullscreen(false) }
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
    if (saveTimer.current && selectedNote) {
      clearTimeout(saveTimer.current)
      saveNote(selectedNote)
    }
    setSelectedNote(null)
    setFullscreen(false)
  }

  // --- Lifecycle ---
  useEffect(() => { loadNotes() }, [])
  // Highlight aus ?highlight=
  const containerRef = useRef<HTMLDivElement>(null)
  const { active: hlActive, term: hlTerm, clear: hlClear } = useHighlight(containerRef, { enabled: !!selectedNote })

  useEffect(() => {
    const openId = searchParams.get("open")
    const searchTitle = searchParams.get("search")
    const hl = searchParams.get("highlight")
    if (openId) {
      loadNote(Number(openId))
      // 'open' verbrauchen, 'highlight' beibehalten (wird von useHighlight gelesen)
      const next = new URLSearchParams()
      if (hl) next.set("highlight", hl)
      setSearchParams(next, { replace: true })
      return
    }
    if (searchTitle && notes.length > 0) {
      handleWikiLinkClick(searchTitle)
      const next = new URLSearchParams()
      if (hl) next.set("highlight", hl)
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, notes])
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [])

  // --- Fullscreen Editor ---
  if (fullscreen && selectedNote) {
    return (
      <div ref={containerRef} className="fixed inset-0 z-30 flex flex-col hud-grid-bg"
        style={{ backgroundColor: 'var(--color-bg-deep)' }}>
        {hlActive && hlTerm && <HighlightDismissBanner term={hlTerm} onDismiss={hlClear} />}
        {/* Fullscreen Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={handleBack}
            className="text-sm" style={{ color: 'var(--color-primary)' }}>
            ← {t.common.back}
          </button>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {saving ? '...' : savedMsg ? '✓' : ''}
          </span>
          <button onClick={() => setFullscreen(false)}
            className="text-sm px-2 py-1 rounded border"
            style={{
              color: 'var(--color-primary)',
              borderColor: 'var(--color-border)',
            }}>
            {t.common.close}
          </button>
        </div>
        {/* Editor Vollbild */}
        <div className="flex-1 overflow-auto p-4">
          <NoteEditor
            title={selectedNote.title}
            content={selectedNote.content}
            saving={saving}
            savedMsg={savedMsg}
            onTitleChange={handleTitleChange}
            onContentChange={handleContentChange}
            onWikiLinkClick={handleWikiLinkClick}
            readOnly={hlActive}
          />
        </div>
      </div>
    )
  }

  // --- Normales Layout ---
  return (
    <div ref={containerRef} className="animate-fade-in flex gap-0 md:gap-6 h-[calc(100vh-3rem)]">
      {hlActive && hlTerm && <HighlightDismissBanner term={hlTerm} onDismiss={hlClear} />}
      {/* Liste */}
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

      {/* Editor */}
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
            {/* Mobile: Zurueck + Fullscreen Buttons */}
            <div className="flex items-center justify-between px-3 py-2 md:py-0 border-b md:border-0"
              style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={handleBack}
                className="md:hidden text-sm"
                style={{ color: 'var(--color-primary)' }}>
                ← {t.common.back}
              </button>
              <button onClick={() => setFullscreen(true)}
                className="text-xs px-2 py-1 rounded border ml-auto"
                style={{
                  color: 'var(--color-text-muted)',
                  borderColor: 'var(--color-border)',
                }}>
                ⛶
              </button>
            </div>
            <NoteEditor
              title={selectedNote.title}
              content={selectedNote.content}
              saving={saving}
              savedMsg={savedMsg}
              onTitleChange={handleTitleChange}
              onContentChange={handleContentChange}
              onWikiLinkClick={handleWikiLinkClick}
              readOnly={hlActive}
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
