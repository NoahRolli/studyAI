// RelationSuggestions — Globale Queue aller AI-Vorschläge
// Zeigt alle offenen Vorschläge, Detect-Button, Bestätigen/Ablehnen
// Wird in der OntologyPage und optional als eigenständige Ansicht genutzt

import { useState, useEffect, useCallback } from 'react'
import { get, post, put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { RelationData } from '../../types/relations'

interface Props {
  onChanged?: () => void
}

export default function RelationSuggestions({ onChanged }: Props) {
  const { language } = useLanguage()
  const [suggestions, setSuggestions] = useState<RelationData[]>([])
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await get<RelationData[]>('/api/relations?status=suggested')
      setSuggestions(data)
    } catch (err) {
      console.error('Vorschläge laden fehlgeschlagen:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadSuggestions() }, [loadSuggestions])

  // Ollama Detect starten
  const handleDetect = async () => {
    setDetecting(true)
    setDetectResult(null)
    try {
      const result = await post<{ suggested: number; total_nodes: number }>(
        '/api/relations/detect',
      )
      const msg = language === 'de'
        ? `${result.suggested} neue Vorschläge aus ${result.total_nodes} Nodes`
        : `${result.suggested} new suggestions from ${result.total_nodes} nodes`
      setDetectResult(msg)
      await loadSuggestions()
      onChanged?.()
    } catch (err) {
      console.error('Detect fehlgeschlagen:', err)
      setDetectResult(language === 'de' ? 'Fehler bei Erkennung' : 'Detection failed')
    } finally { setDetecting(false) }
  }

  // Bestätigen
  const handleConfirm = async (id: number) => {
    try {
      await put(`/api/relations/${id}/confirm`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
      onChanged?.()
    } catch (err) {
      console.error('Bestätigung fehlgeschlagen:', err)
    }
  }

  // Ablehnen
  const handleReject = async (id: number) => {
    try {
      await put(`/api/relations/${id}/reject`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
      onChanged?.()
    } catch (err) {
      console.error('Ablehnung fehlgeschlagen:', err)
    }
  }

  // Alle bestätigen
  const handleConfirmAll = async () => {
    for (const s of suggestions) {
      await put(`/api/relations/${s.id}/confirm`)
    }
    setSuggestions([])
    onChanged?.()
  }

  // Alle ablehnen
  const handleRejectAll = async () => {
    for (const s of suggestions) {
      await put(`/api/relations/${s.id}/reject`)
    }
    setSuggestions([])
    onChanged?.()
  }

  const typeLabel = (rt: RelationData['relation_type']) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  const nodeLabel = (type: string, id: number) => {
    const labels: Record<string, string> = {
      note: 'Note', summary: 'Summary', module: 'Module',
    }
    return `${labels[type] || type} #${id}`
  }

  return (
    <div className="space-y-4">
      {/* Header + Detect Button */}
      <div className="flex items-center justify-between">
        <h3 className="hud-title text-glow text-lg">
          {language === 'de' ? 'AI-VORSCHLÄGE' : 'AI SUGGESTIONS'}
          {suggestions.length > 0 && (
            <span className="ml-2 text-sm" style={{ color: 'var(--color-warning)' }}>
              ({suggestions.length})
            </span>
          )}
        </h3>
        <button onClick={handleDetect} disabled={detecting}
          className="hud-btn text-sm">
          {detecting
            ? (language === 'de' ? 'Analysiere...' : 'Analyzing...')
            : (language === 'de' ? 'Relationen erkennen' : 'Detect Relations')}
        </button>
      </div>

      {/* Detect-Resultat */}
      {detectResult && (
        <p className="text-xs px-3 py-2 rounded"
          style={{
            background: 'var(--color-hover-bg)',
            color: 'var(--color-text-secondary)',
          }}>
          {detectResult}
        </p>
      )}

      {/* Batch-Aktionen */}
      {suggestions.length > 1 && (
        <div className="flex gap-2">
          <button onClick={handleConfirmAll} className="text-xs"
            style={{ color: 'var(--color-success)' }}>
            {language === 'de' ? 'Alle bestätigen' : 'Confirm all'}
          </button>
          <span style={{ color: 'var(--color-text-muted)' }}>|</span>
          <button onClick={handleRejectAll} className="text-xs"
            style={{ color: 'var(--color-danger)' }}>
            {language === 'de' ? 'Alle ablehnen' : 'Reject all'}
          </button>
        </div>
      )}

      {/* Vorschlagsliste */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Laden...' : 'Loading...'}
        </p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de'
            ? 'Keine offenen Vorschläge. Klicke "Relationen erkennen" um neue zu generieren.'
            : 'No pending suggestions. Click "Detect Relations" to generate new ones.'}
        </p>
      ) : (
        <div className="space-y-2">
          {suggestions.map(s => (
            <div key={s.id} className="p-3 rounded-lg border"
              style={{
                background: 'var(--color-bg-surface)',
                borderColor: 'rgba(255, 170, 0, 0.2)',
              }}>
              {/* Tripel-Darstellung */}
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {nodeLabel(s.source_type, s.source_id)}
                </span>
                <span className="font-semibold px-2 py-0.5 rounded text-xs"
                  style={{
                    color: 'var(--color-warning)',
                    background: 'rgba(255, 170, 0, 0.1)',
                  }}>
                  {typeLabel(s.relation_type)}
                </span>
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {nodeLabel(s.target_type, s.target_id)}
                </span>
              </div>

              {/* Begründung */}
              {s.reason && (
                <p className="text-xs mt-1.5"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  {s.reason}
                </p>
              )}

              {/* Aktionen */}
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleConfirm(s.id)}
                  className="hud-btn text-xs px-3 py-1"
                  style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
                  {language === 'de' ? 'Bestätigen' : 'Confirm'}
                </button>
                <button onClick={() => handleReject(s.id)}
                  className="hud-btn text-xs px-3 py-1"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                  {language === 'de' ? 'Ablehnen' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
