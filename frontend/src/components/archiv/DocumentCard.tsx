// DocumentCard — Einzelne Dokument-Karte in ModuleDetail
// Inline-Edit fuer Dokumenttitel, Datei-Typ-Badge
// Summary mit editierbarem Titel + TipTap-Editor Toggle
// Key terms editierbar: loeschen (X) + hinzufuegen (Input)

import { useState } from 'react'
import { put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { Document, Summary } from '../../types/models'
import SummaryEditor from './SummaryEditor'
import KeyTermsEditor from './KeyTermsEditor'

// Datei-Typ Badges (Text, keine Emojis)
const FILE_ICONS: Record<string, string> = {
  pdf: 'PDF', docx: 'DOC', doc: 'DOC', pptx: 'PPT', ppt: 'PPT',
  xlsx: 'XLS', xls: 'XLS', md: 'MD', txt: 'TXT',
  png: 'IMG', jpg: 'IMG', jpeg: 'IMG', csv: 'CSV',
}

interface Props {
  doc: Document
  summary?: Summary
  generating: boolean
  generatingMindmap: boolean
  onSummarize: () => void
  onMindmap: () => void
  onDelete: () => void
  onReload?: () => void
}

export default function DocumentCard({
  doc, summary, generating, generatingMindmap,
  onSummarize, onMindmap, onDelete, onReload,
}: Props) {
  const { t } = useLanguage()
  const [editingDoc, setEditingDoc] = useState(false)
  const [docTitle, setDocTitle] = useState(doc.display_name || doc.filename)
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryTitle, setSummaryTitle] = useState(summary?.title || '')
  const [editingContent, setEditingContent] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const isPdf = doc.file_type === "pdf"

  const displayName = doc.display_name || doc.filename
  const icon = FILE_ICONS[doc.file_type] || 'FILE'

  // Dokument-Titel speichern
  const saveDocTitle = async () => {
    setEditingDoc(false)
    const trimmed = docTitle.trim()
    if (trimmed === displayName) return
    try {
      await put(`/api/documents/${doc.id}`, { display_name: trimmed || null })
      onReload?.()
    } catch (err) { console.error('Rename fehlgeschlagen:', err) }
  }

  // Summary-Titel speichern
  const saveSummaryTitle = async () => {
    setEditingSummary(false)
    if (!summary) return
    const trimmed = summaryTitle.trim()
    if (trimmed === (summary.title || '')) return
    try {
      await put(`/api/summaries/${summary.id}/title`, { title: trimmed || null })
      onReload?.()
    } catch (err) { console.error('Summary-Rename fehlgeschlagen:', err) }
  }

  // Provider-Anzeige: model_used bevorzugt, ai_provider als Fallback
  const providerLabel = summary?.model_used || summary?.ai_provider || ''

  return (
    <div className="hud-card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0"
            style={{ color: 'var(--color-primary)', background: 'var(--color-hover-bg)',
              border: '1px solid var(--color-border)' }}>
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            {editingDoc ? (
              <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
                onBlur={saveDocTitle} onKeyDown={e => e.key === 'Enter' && saveDocTitle()}
                autoFocus className="hud-input text-sm w-full py-0.5" />
            ) : (
              <h3 className="font-medium text-sm truncate cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onClick={() => setEditingDoc(true)}>
                {displayName}
              </h3>
            )}
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {doc.file_type.toUpperCase()} · {new Date(doc.uploaded_at).toLocaleDateString('de-CH')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isPdf && (
            <button onClick={() => setShowPreview(!showPreview)}
              className="text-xs px-2 py-0.5 rounded transition-colors
                text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
              {showPreview ? "Preview aus" : "Preview"}
            </button>
          )}
          <button onClick={onSummarize} disabled={generating}
            className="hud-btn hud-btn-primary" style={{ fontSize: '0.65rem' }}>
            {generating ? t.moduleDetail.generating : t.moduleDetail.summarize}
          </button>
          <button onClick={onDelete}
            className="text-xs transition-colors"
            style={{ color: 'rgba(255,59,92,0.4)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,59,92,0.4)')}>
            {t.common.delete}
          </button>
        </div>
      </div>

      {showPreview && isPdf && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <iframe
            src={`${import.meta.env.DEV ? "http://localhost:8000" : ""}/api/documents/${doc.id}/file`}
            className="w-full rounded border"
            style={{ height: "500px", borderColor: "var(--color-border)" }}
            title={doc.filename}
          />
        </div>
      )}

      {summary && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h4 className="text-xs font-semibold shrink-0"
                style={{ color: 'var(--color-text-secondary)' }}>
                {t.moduleDetail.summaryTitle}
              </h4>
              {editingSummary ? (
                <input value={summaryTitle}
                  onChange={e => setSummaryTitle(e.target.value)}
                  onBlur={saveSummaryTitle}
                  onKeyDown={e => e.key === 'Enter' && saveSummaryTitle()}
                  autoFocus className="hud-input text-xs flex-1 py-0.5"
                  placeholder="Titel..." />
              ) : (
                <span className="text-xs cursor-pointer hover:underline truncate"
                  style={{ color: summary.title ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                  onClick={() => { setSummaryTitle(summary.title || ''); setEditingSummary(true) }}>
                  {summary.title || '(click to add title)'}
                </span>
              )}
              {providerLabel && (
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  via {providerLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setEditingContent(!editingContent)}
                className="text-xs px-2 py-0.5 rounded transition-colors
                  text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                {editingContent ? t.common.close : t.common.edit}
              </button>
              <button onClick={onMindmap} disabled={generatingMindmap}
                className="hud-btn" style={{ fontSize: '0.65rem' }}>
                {generatingMindmap ? t.moduleDetail.generatingMindmap : t.moduleDetail.openMindmap}
              </button>
            </div>
          </div>

          {editingContent ? (
            <SummaryEditor
              summaryId={summary.id}
              content={summary.summary}
              onClose={() => setEditingContent(false)}
              onSaved={() => onReload?.()}
            />
          ) : (
            <p className="text-sm leading-relaxed cursor-pointer hover:opacity-80"
              style={{ color: 'var(--color-text-secondary)' }}
              onClick={() => setEditingContent(true)}>
              {summary.summary}
            </p>
          )}

          <KeyTermsEditor
            summaryId={summary.id}
            terms={summary.key_terms}
            onUpdated={() => onReload?.()}
          />
        </div>
      )}
    </div>
  )
}
