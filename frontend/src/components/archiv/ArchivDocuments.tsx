// ArchivDocuments — Upload-Zone + lose Dokumente in einem Ordner
// Drag & Drop oder Button-Upload direkt in den aktuellen Ordner
//
// File-Type-Dispatch:
//   chat            → Link auf /archiv/llm-chat/:id
//   llm_memory      → Klickbar, Expand zeigt raw_text als <pre>
//   llm_project_doc → wie llm_memory
//   alles andere    → Standard-Card (Icon + Name + Delete)

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { del, get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { Document } from '../../types/models'
import SortDropdown from '../SortDropdown'
import { useDocumentSort } from '../../hooks/useDocumentSort'

// Datei-Typ Badges (Text, keine Emojis)
const FILE_ICONS: Record<string, string> = {
  pdf: 'PDF', docx: 'DOC', doc: 'DOC', pptx: 'PPT', ppt: 'PPT',
  xlsx: 'XLS', xls: 'XLS', md: 'MD', txt: 'TXT',
  png: 'IMG', jpg: 'IMG', jpeg: 'IMG', csv: 'CSV',
  chat: 'CHAT', llm_memory: 'MEM', llm_project_doc: 'PDOC',
}

interface Props {
  folderId: number | null
  documents: Document[]
  onReload: () => void
}

// Markdown-Doc-Card mit lazy-loaded raw_text
function MarkdownDocRow({ doc, header, expanded, setExpanded }: {
  doc: Document
  header: React.ReactNode
  expanded: boolean
  setExpanded: (v: boolean) => void
}) {
  const [fullText, setFullText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Beim ersten Expand: raw_text nachladen
  useEffect(() => {
    if (!expanded || fullText !== null || loading) return
    setLoading(true)
    get<Document>(`/api/documents/${doc.id}`)
      .then((full) => setFullText(full.raw_text || ''))
      .catch(() => setFullText('(Fehler beim Laden)'))
      .finally(() => setLoading(false))
  }, [expanded, fullText, loading, doc.id])

  return (
    <div className="hud-card">
      <div className="px-4 py-3 flex items-center justify-between cursor-pointer
          hover:bg-[var(--color-hover-bg)] transition-colors"
        onClick={() => setExpanded(!expanded)}>
        {header}
      </div>
      {expanded && (
        <div className="px-4 pb-4">
          <pre className="text-xs font-mono p-3 rounded overflow-auto max-h-[600px]"
            style={{ color: 'var(--color-text-secondary)',
              background: 'var(--color-hover-bg)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {loading ? 'Lade...' : (fullText || '(leer)')}
          </pre>
        </div>
      )}
    </div>
  )
}


// Eine einzelne Doc-Card — interner Sub-Component
function DocRow({ doc, onDelete, tDelete }: {
  doc: Document
  onDelete: (id: number) => void
  tDelete: string
}) {
  const [expanded, setExpanded] = useState(false)
  const icon = FILE_ICONS[doc.file_type] || 'FILE'
  const name = doc.display_name || doc.filename

  const isChat = doc.file_type === 'chat'
  const isMarkdownDoc = doc.file_type === 'llm_memory' || doc.file_type === 'llm_project_doc'

  // Badge + Name + Meta (gemeinsam für alle Varianten)
  const header = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0"
          style={{ color: 'var(--color-primary)',
            background: 'var(--color-hover-bg)',
            border: '1px solid var(--color-border)' }}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm truncate"
            style={{ color: 'var(--color-text-primary)' }}>{name}</p>
          <span className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}>
            {doc.file_type.toUpperCase()}
            {doc.uploaded_at && ` · ${new Date(doc.uploaded_at).toLocaleDateString('de-CH')}`}
          </span>
        </div>
      </div>
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(doc.id) }}
        className="text-xs transition-colors shrink-0"
        style={{ color: 'rgba(255,59,92,0.4)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,59,92,0.4)')}>
        {tDelete}
      </button>
    </>
  )

  // Chat → Link auf Vollseiten-Viewer
  if (isChat) {
    return (
      <Link to={`/archiv/llm-chat/${doc.id}`}
        className="hud-card px-4 py-3 flex items-center justify-between
          hover:border-[var(--color-primary)] transition-colors">
        {header}
      </Link>
    )
  }

  // Markdown-Doc → klickbar, klappt raw_text inline aus (lazy-load)
  if (isMarkdownDoc) {
    return <MarkdownDocRow doc={doc} header={header}
      expanded={expanded} setExpanded={setExpanded} />
  }

  // Default: normale Doc-Card
  return (
    <div className="hud-card px-4 py-3 flex items-center justify-between">
      {header}
    </div>
  )
}

export default function ArchivDocuments({ folderId, documents, onReload }: Props) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const docSort = useDocumentSort(documents, {
    dateField: "uploaded_at",
    nameField: (d) => d.display_name || d.filename,
    typeField: "file_type",
  })

  // --- Upload ---
  async function uploadFile(file: File) {
    if (folderId === null) {
      setError(t.archiv.uploadNeedsFolder || 'Bitte zuerst einen Ordner öffnen.')
      return
    }
    try {
      setUploading(true)
      setError(null)
      const formData = new FormData()
      formData.append('file', file)
      const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''
      const resp = await fetch(`${API_BASE}/api/folders/${folderId}/documents`, {
        method: 'POST', body: formData, credentials: 'include',
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.detail || `Upload failed: ${resp.status}`)
      }
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally { setUploading(false) }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  async function handleDelete(docId: number) {
    try {
      await del(`/api/documents/${docId}`)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  // Kein Upload auf Root-Ebene (kein Ordner geöffnet)
  if (folderId === null && documents.length === 0) return null

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {error && (
        <div className="px-4 py-2 rounded-lg mb-4 border text-xs"
          style={{ background: 'rgba(255,59,92,0.1)',
            borderColor: 'rgba(255,59,92,0.3)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {/* Upload-Zone (nur wenn in einem Ordner) */}
      {folderId !== null && (
        <div className={`hud-card p-4 mb-4 transition-all duration-300
          ${dragOver ? 'border-[var(--color-primary)]' : ''}`}
          style={dragOver ? {
            boxShadow: '0 0 25px var(--color-highlight-glow)',
            borderColor: 'var(--color-primary)',
          } : {}}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold mb-1"
                style={{ color: 'var(--color-primary)' }}>
                {dragOver ? (t.archiv.dropHere || 'Datei hier ablegen...')
                  : (t.archiv.uploadTitle || 'Datei hochladen')}
              </h3>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                PDF, Word, Excel, PowerPoint, Markdown, TXT, Bilder
              </p>
            </div>
            <label className="hud-btn cursor-pointer" style={{ fontSize: '0.65rem' }}>
              {uploading ? (t.archiv.uploading || 'Hochladen...')
                : (t.archiv.uploadButton || 'Datei wählen')}
              <input type="file" onChange={handleFileInput} disabled={uploading}
                className="hidden"
                accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.png,.jpg,.jpeg,.csv" />
            </label>
          </div>
        </div>
      )}

      {/* Lose Dokumente */}
      {documents.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold"
              style={{ color: 'var(--color-text-muted)' }}>
              {t.archiv.looseDocuments || 'Dokumente'} ({documents.length})
            </h3>
            <SortDropdown mode={docSort.mode} onChange={docSort.setMode} showType={docSort.hasTypeField} />
          </div>
          <div className="space-y-2">
            {docSort.sorted.map((doc) => (
              <DocRow key={doc.id} doc={doc} onDelete={handleDelete}
                tDelete={t.common.delete} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
