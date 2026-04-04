// NoteAIPanel — AI-Features für Notizen (Ollama-powered)
// Zusammenfassung, verwandte Notizen, Link-Vorschläge
// Wird unter dem BacklinksPanel angezeigt
// Alle Anfragen gehen an lokales Ollama (MacBook/Server)

import { useState } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

interface RelatedNote {
  id: number
  title: string
  reason: string
}

interface LinkSuggestion {
  id: number
  title: string
}

interface NoteAIPanelProps {
  noteId: number
  onNavigate: (id: number) => void
}

function NoteAIPanel({ noteId, onNavigate }: NoteAIPanelProps) {
  const { t } = useLanguage()

  // State für die drei AI-Features
  const [summary, setSummary] = useState<string | null>(null)
  const [related, setRelated] = useState<RelatedNote[] | null>(null)
  const [suggestions, setSuggestions] = useState<LinkSuggestion[] | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Zusammenfassung generieren
  async function handleSummarize() {
    setLoading('summary')
    setError(null)
    try {
      const data = await post<{ summary: string }>(
        `/api/notes/${noteId}/summarize`, {}
      )
      setSummary(data.summary)
    } catch {
      setError(t.notes.aiError)
    }
    setLoading(null)
  }

  // Verwandte Notizen finden
  async function handleRelated() {
    setLoading('related')
    setError(null)
    try {
      const data = await get<RelatedNote[]>(`/api/notes/${noteId}/related`)
      setRelated(data)
    } catch {
      setError(t.notes.aiError)
    }
    setLoading(null)
  }

  // Link-Vorschläge holen
  async function handleSuggestLinks() {
    setLoading('links')
    setError(null)
    try {
      const data = await get<LinkSuggestion[]>(
        `/api/notes/${noteId}/suggest-links`
      )
      setSuggestions(data)
    } catch {
      setError(t.notes.aiError)
    }
    setLoading(null)
  }

  return (
    <div
      className="mt-3 pt-3 border-t"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* AI-Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          onClick={handleSummarize}
          disabled={loading !== null}
          className="hud-btn text-xs"
        >
          {loading === 'summary' ? t.notes.aiLoading : t.notes.aiSummarize}
        </button>
        <button
          onClick={handleRelated}
          disabled={loading !== null}
          className="hud-btn text-xs"
        >
          {loading === 'related' ? t.notes.aiLoading : t.notes.aiRelated}
        </button>
        <button
          onClick={handleSuggestLinks}
          disabled={loading !== null}
          className="hud-btn text-xs"
        >
          {loading === 'links' ? t.notes.aiLoading : t.notes.aiSuggestLinks}
        </button>
      </div>

      {/* Fehler */}
      {error && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {/* Zusammenfassung */}
      {summary && (
        <div className="mb-2">
          <span
            className="text-xs font-bold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.notes.aiSummarize}
          </span>
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {summary}
          </p>
        </div>
      )}

      {/* Verwandte Notizen */}
      {related && related.length > 0 && (
        <div className="mb-2">
          <span
            className="text-xs font-bold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.notes.aiRelated}
          </span>
          <div className="flex flex-col gap-1 mt-1">
            {related.map((r) => (
              <button
                key={r.id}
                onClick={() => onNavigate(r.id)}
                className="text-left text-xs px-2 py-1 rounded transition-all
                  duration-200 hover:bg-[rgba(0,212,255,0.1)]"
                style={{ color: 'var(--color-primary)' }}
              >
                {r.title}
                {r.reason && (
                  <span
                    className="ml-2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    — {r.reason}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Link-Vorschläge */}
      {suggestions && suggestions.length > 0 && (
        <div className="mb-2">
          <span
            className="text-xs font-bold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.notes.aiSuggestLinks}
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {suggestions.map((s) => (
              <span
                key={s.id}
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  color: 'var(--color-primary)',
                  backgroundColor: 'var(--color-active-bg)',
                }}
              >
                [[{s.title}]]
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leere Ergebnisse */}
      {related && related.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t.notes.aiNoRelated}
        </p>
      )}
      {suggestions && suggestions.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t.notes.aiNoSuggestions}
        </p>
      )}
    </div>
  )
}

export default NoteAIPanel
