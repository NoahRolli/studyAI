// DocumentCard — Einzelne Dokument-Karte in ModuleDetail
// Zeigt Dateiname, Upload-Datum, Summary, Mindmap-Button

import { useLanguage } from '../../hooks/useLanguage'
import type { Document, Summary } from '../../types/models'

interface Props {
  doc: Document
  summary?: Summary
  generating: boolean
  generatingMindmap: boolean
  onSummarize: () => void
  onMindmap: () => void
  onDelete: () => void
}

export default function DocumentCard({
  doc, summary, generating, generatingMindmap,
  onSummarize, onMindmap, onDelete,
}: Props) {
  const { t } = useLanguage()

  return (
    <div className="hud-card p-5 animate-fade-in">
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
          <button onClick={onSummarize} disabled={generating}
            className="hud-btn hud-btn-primary" style={{ fontSize: '0.65rem' }}>
            {generating ? t.moduleDetail.generating : t.moduleDetail.summarize}
          </button>
          <button onClick={onDelete}
            className="text-xs transition-colors"
            style={{ color: 'rgba(255,59,92,0.4)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,59,92,0.4)')}>
            {t.common.delete}
          </button>
        </div>
      </div>

      {summary && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              {t.moduleDetail.summaryTitle}
              <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
                via {summary.ai_provider}
              </span>
            </h4>
            <button onClick={onMindmap} disabled={generatingMindmap}
              className="hud-btn" style={{ fontSize: '0.65rem' }}>
              {generatingMindmap ? t.moduleDetail.generatingMindmap : t.moduleDetail.openMindmap}
            </button>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {summary.summary}
          </p>
          {summary.key_terms.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {summary.key_terms.map((term, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded border"
                  style={{
                    backgroundColor: 'var(--color-hover-bg)',
                    borderColor: 'var(--color-border-glow)',
                    color: 'var(--color-text-secondary)',
                  }}>
                  {term}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
