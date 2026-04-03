// ModuleDetail — Detailseite für ein einzelnes Studienmodul
// Zeigt alle Dokumente des Moduls an
// Ermöglicht Datei-Upload, Zusammenfassung generieren und Mindmap öffnen

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { get, post, del } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import type { Module, Document, Summary } from '../types/models'

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

  // Summaries aus der DB laden
  async function loadSummaries(docs: Document[]) {
    const loaded: Record<number, Summary> = {}
    for (const doc of docs) {
      try {
        const docSummaries = await get<Summary[]>(`/api/documents/${doc.id}/summaries`)
        if (docSummaries.length > 0) {
          loaded[doc.id] = docSummaries[docSummaries.length - 1]
        }
      } catch {
        console.warn(`Keine Summaries für Dokument ${doc.id}`)
      }
    }
    setSummaries(loaded)
  }

  // Daten laden
  async function loadModule() {
    try {
      setLoading(true)
      setError(null)
      const moduleData = await get<Module>(`/api/modules/${id}`)
      setModule(moduleData)
      const docsData = await get<Document[]>(`${API_BASE}/api/modules/${id}/documents/`)
      setDocuments(docsData)
      await loadSummaries(docsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) loadModule()
  }, [id])

  // Datei-Upload
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      setError(null)
      const formData = new FormData()
      formData.append('file', file)
      const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''
      const response = await fetch(
        `${API_BASE}/api/modules/${id}/documents/`,
        { method: 'POST', body: formData, credentials: 'include' }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || `Upload failed: ${response.status}`)
      }
      await loadModule()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  // Zusammenfassung generieren
  async function generateSummary(documentId: number) {
    try {
      setGenerating(documentId)
      setError(null)
      const summary = await post<Summary>(`/api/documents/${documentId}/summarize`)
      setSummaries((prev) => ({ ...prev, [documentId]: summary }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setGenerating(null)
    }
  }

  // Mindmap generieren und öffnen
  async function openMindmap(summaryId: number) {
    try {
      setGeneratingMindmap(summaryId)
      setError(null)
      try {
        await get(`/api/summaries/${summaryId}/mindmap`)
      } catch {
        await post(`/api/summaries/${summaryId}/mindmap`)
      }
      window.location.href = `/mindmap/${summaryId}`
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setGeneratingMindmap(null)
    }
  }

  // Dokument löschen
  async function deleteDocument(documentId: number) {
    try {
      await del(`/api/documents/${documentId}`)
      await loadModule()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <p style={{ color: 'var(--color-text-muted)' }}>{t.moduleDetail.moduleLoading}</p>
      </div>
    )
  }

  if (!module) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <p className="text-lg mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t.moduleDetail.notFound}
        </p>
        <Link to="/dashboard" className="text-sm" style={{ color: 'var(--color-primary)' }}>
          {t.moduleDetail.backToDashboard}
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Link
        to="/dashboard"
        className="text-xs mb-4 inline-block transition-colors"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t.moduleDetail.backToDashboard}
      </Link>

      <div className="mb-8">
        <h1 className="hud-title text-glow text-2xl">{module.name}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {module.description}
        </p>
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-lg mb-6 border"
          style={{
            background: 'rgba(255, 59, 92, 0.1)',
            borderColor: 'rgba(255, 59, 92, 0.3)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      {/* Upload-Bereich */}
      <div className="hud-card p-6 mb-8">
        <h2 className="hud-title text-sm mb-3" style={{ color: 'var(--color-primary)' }}>
          {t.moduleDetail.uploadTitle}
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t.moduleDetail.uploadHint}
        </p>
        <label className="hud-btn inline-block cursor-pointer">
          {uploading ? t.moduleDetail.uploading : t.moduleDetail.uploadButton}
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.png,.jpg,.jpeg"
          />
        </label>
      </div>

      {/* Dokument-Liste */}
      <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
        {t.moduleDetail.documentsTitle} ({documents.length})
      </h2>

      {documents.length === 0 && (
        <div className="hud-card text-center py-12">
          <p className="mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {t.moduleDetail.emptyDocs}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            {t.moduleDetail.emptyDocsHint}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {documents.map((doc) => (
          <div key={doc.id} className="hud-card p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {doc.filename}
                </h3>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {doc.file_type.toUpperCase()} · {new Date(doc.uploaded_at).toLocaleDateString('de-CH')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => generateSummary(doc.id)}
                  disabled={generating === doc.id}
                  className="hud-btn hud-btn-primary"
                  style={{ fontSize: '0.65rem' }}
                >
                  {generating === doc.id ? t.moduleDetail.generating : t.moduleDetail.summarize}
                </button>
                <button
                  onClick={() => deleteDocument(doc.id)}
                  className="text-xs transition-colors"
                  style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}
                >
                  {t.common.delete}
                </button>
              </div>
            </div>

            {summaries[doc.id] && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.moduleDetail.summaryTitle}
                    <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                      via {summaries[doc.id].ai_provider}
                    </span>
                  </h4>
                  <button
                    onClick={() => openMindmap(summaries[doc.id].id)}
                    disabled={generatingMindmap === summaries[doc.id].id}
                    className="hud-btn"
                    style={{ fontSize: '0.65rem' }}
                  >
                    {generatingMindmap === summaries[doc.id].id
                      ? t.moduleDetail.generatingMindmap
                      : t.moduleDetail.openMindmap}
                  </button>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {summaries[doc.id].summary}
                </p>
                {summaries[doc.id].key_terms.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {summaries[doc.id].key_terms.map((term, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 rounded border"
                        style={{
                          backgroundColor: 'rgba(0, 212, 255, 0.05)',
                          borderColor: 'var(--color-border-glow)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ModuleDetail