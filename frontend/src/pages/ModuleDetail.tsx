// ModuleDetail — Detailseite für ein Studienmodul
// Zeigt Dokumente, ermöglicht Upload (Button + Drag & Drop),
// Zusammenfassung generieren und Mindmap öffnen

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { get, post, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import type { Module, Document, Summary } from '../types/models'
import DocumentCard from '../components/archiv/DocumentCard'
import SortDropdown from '../components/SortDropdown'
import { useDocumentSort } from '../hooks/useDocumentSort'
import { useHighlight } from '../hooks/useHighlight'
import HighlightDismissBanner from '../components/HighlightDismissBanner'

function ModuleDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useLanguage()
  const [module, setModule] = useState<Module | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [summaries, setSummaries] = useState<Record<number, Summary>>({})
  const [generating, setGenerating] = useState<number | null>(null)
  const [generatingMindmap, setGeneratingMindmap] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [searchParams] = useSearchParams()
  const focusSummaryId = searchParams.get('summary')
  const containerRef = useRef<HTMLDivElement>(null)
  const { active: hlActive, term: hlTerm, clear: hlClear } = useHighlight(containerRef)

  const docSort = useDocumentSort(documents, {
    dateField: "uploaded_at",
    nameField: (d) => d.display_name || d.filename,
    typeField: "file_type",
  })

  // --- Daten laden ---
  const loadModule = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const moduleData = await get<Module>(`/api/modules/${id}`)
      setModule(moduleData)
      const docsData = await get<Document[]>(`/api/modules/${id}/documents`)
      setDocuments(docsData)
      // Summaries laden
      const loaded: Record<number, Summary> = {}
      for (const doc of docsData) {
        try {
          const s = await get<Summary[]>(`/api/documents/${doc.id}/summaries`)
          if (s.length > 0) loaded[doc.id] = s[s.length - 1]
        } catch { /* Keine Summaries */ }
      }
      setSummaries(loaded)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally { setLoading(false) }
  }, [id, t])

  useEffect(() => { if (id) loadModule() }, [id, loadModule])

  // Scroll zu der DocumentCard die das ?summary=ID enthaelt
  useEffect(() => {
    if (!focusSummaryId || documents.length === 0) return
    const sid = Number(focusSummaryId)
    const doc = documents.find(d => summaries[d.id]?.id === sid)
    if (!doc) return
    // Card via data-doc-id finden (wird unten gesetzt)
    const el = document.querySelector<HTMLElement>(`[data-doc-id="${doc.id}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusSummaryId, documents, summaries])


  // --- Upload (Button + DnD) ---
  async function uploadFile(file: File) {
    try {
      setUploading(true)
      setError(null)
      const formData = new FormData()
      formData.append('file', file)
      const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''
      const response = await fetch(`${API_BASE}/api/modules/${id}/documents`,
        { method: 'POST', body: formData, credentials: 'include' })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || `Upload failed: ${response.status}`)
      }
      await loadModule()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally { setUploading(false) }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) uploadFile(file)
    event.target.value = ''
  }

  // Drag & Drop Handler
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  async function generateSummary(documentId: number) {
    try {
      setGenerating(documentId)
      const summary = await post<Summary>(`/api/documents/${documentId}/summarize`)
      setSummaries((prev) => ({ ...prev, [documentId]: summary }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally { setGenerating(null) }
  }

  async function openMindmap(summaryId: number) {
    try {
      setGeneratingMindmap(summaryId)
      try { await get(`/api/summaries/${summaryId}/mindmap`) }
      catch { await post(`/api/summaries/${summaryId}/mindmap`) }
      window.location.href = `/mindmap/${summaryId}`
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally { setGeneratingMindmap(null) }
  }

  async function deleteDocument(documentId: number) {
    try { await del(`/api/documents/${documentId}`); await loadModule() }
    catch (err) { setError(err instanceof Error ? err.message : t.common.error) }
  }


  if (loading) return (
    <div className="animate-fade-in">
      <p style={{ color: 'var(--color-text-muted)' }}>{t.moduleDetail.moduleLoading}</p>
    </div>
  )

  if (!module) return (
    <div className="text-center py-16 animate-fade-in">
      <p className="text-lg mb-4" style={{ color: 'var(--color-text-muted)' }}>{t.moduleDetail.notFound}</p>
      <Link to="/archiv" className="text-sm" style={{ color: 'var(--color-primary)' }}>
        {t.moduleDetail.backToArchiv}
      </Link>
    </div>
  )

  return (
    <div ref={containerRef} className="animate-fade-in"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}>
      {hlActive && hlTerm && <HighlightDismissBanner term={hlTerm} onDismiss={hlClear} />}


      <Link to="/archiv" className="text-xs mb-4 inline-block transition-colors"
        style={{ color: 'var(--color-text-muted)' }}>
        {t.moduleDetail.backToArchiv}
      </Link>

      <div className="mb-8">
        <h1 className="hud-title text-glow text-2xl">{module.name}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{module.description}</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg mb-6 border"
          style={{ background: 'rgba(255,59,92,0.1)', borderColor: 'rgba(255,59,92,0.3)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {/* Upload-Bereich mit Drop-Zone */}
      <div className={`hud-card p-6 mb-8 transition-all duration-300 ${dragOver ? 'border-[var(--color-primary)]' : ''}`}
        style={dragOver ? { boxShadow: '0 0 25px var(--color-highlight-glow)', borderColor: 'var(--color-primary)' } : {}}>
        <h2 className="hud-title text-sm mb-3" style={{ color: 'var(--color-primary)' }}>
          {t.moduleDetail.uploadTitle}
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {dragOver ? (t.moduleDetail.dropHere || 'Drop file here...') : t.moduleDetail.uploadHint}
        </p>
        <label className="hud-btn inline-block cursor-pointer">
          {uploading ? t.moduleDetail.uploading : t.moduleDetail.uploadButton}
          <input type="file" onChange={handleFileInput} disabled={uploading} className="hidden"
            accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.png,.jpg,.jpeg" />
        </label>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="hud-title text-sm" style={{ color: "var(--color-primary)" }}>
          {t.moduleDetail.documentsTitle} ({documents.length})
        </h2>
        <SortDropdown mode={docSort.mode} onChange={docSort.setMode} showType={docSort.hasTypeField} />
      </div>

      {documents.length === 0 && (
        <div className="hud-card text-center py-12">
          <p className="mb-1" style={{ color: 'var(--color-text-muted)' }}>{t.moduleDetail.emptyDocs}</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>{t.moduleDetail.emptyDocsHint}</p>
        </div>
      )}

      <div className="space-y-4">
        {docSort.sorted.map((doc) => (
          <div key={doc.id} data-doc-id={doc.id}>
            <DocumentCard doc={doc} summary={summaries[doc.id]}
              generating={generating === doc.id}
              generatingMindmap={generatingMindmap === summaries[doc.id]?.id}
              onSummarize={() => generateSummary(doc.id)}
              onMindmap={() => summaries[doc.id] && openMindmap(summaries[doc.id].id)}
              onDelete={() => deleteDocument(doc.id)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default ModuleDetail
