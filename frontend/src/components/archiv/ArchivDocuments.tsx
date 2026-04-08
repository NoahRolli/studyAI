// ArchivDocuments — Upload-Zone + lose Dokumente in einem Ordner
// Drag & Drop oder Button-Upload direkt in den aktuellen Ordner

import { useState } from 'react'
import { del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { Document } from '../../types/models'

// Datei-Typ Badges (Text, keine Emojis)
const FILE_ICONS: Record<string, string> = {
  pdf: 'PDF', docx: 'DOC', doc: 'DOC', pptx: 'PPT', ppt: 'PPT',
  xlsx: 'XLS', xls: 'XLS', md: 'MD', txt: 'TXT',
  png: 'IMG', jpg: 'IMG', jpeg: 'IMG', csv: 'CSV',
}

interface Props {
  folderId: number | null
  documents: Document[]
  onReload: () => void
}

export default function ArchivDocuments({ folderId, documents, onReload }: Props) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          <h3 className="text-xs font-semibold mb-3"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.archiv.looseDocuments || 'Dokumente'} ({documents.length})
          </h3>
          <div className="space-y-2">
            {documents.map((doc) => {
              const icon = FILE_ICONS[doc.file_type] || 'FILE'
              const name = doc.display_name || doc.filename
              return (
                <div key={doc.id}
                  className="hud-card px-4 py-3 flex items-center justify-between">
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
                  <button onClick={() => handleDelete(doc.id)}
                    className="text-xs transition-colors shrink-0"
                    style={{ color: 'rgba(255,59,92,0.4)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,59,92,0.4)')}>
                    {t.common.delete}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
