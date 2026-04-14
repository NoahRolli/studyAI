// RelationSuggestions — Globale Queue aller AI-Vorschläge
// Detect mit Live-Polling (zeigt neue Vorschläge während Generierung)
// Cleanup: Suggestions löschen + verwaiste Konzepte aufräumen

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, put, del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import LoadingDot from '../LoadingDot'
import OntologyEditModal from './OntologyEditModal'
import type { EditTarget } from './OntologyEditModal'
import type { RelationData } from '../../types/relations'

interface Props {
  onChanged?: () => void
}

export default function RelationSuggestions({ onChanged }: Props) {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [suggestions, setSuggestions] = useState<RelationData[]>([])
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await get<RelationData[]>('/api/relations?status=suggested')
      setSuggestions(data)
    } catch (err) {
      console.error('Vorschläge laden fehlgeschlagen:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadSuggestions() }, [loadSuggestions])

  // Polling stoppen bei Unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Detect mit Live-Polling
  const handleDetect = async () => {
    setDetecting(true)
    setDetectResult(null)
    setCleanupMsg(null)

    // Polling starten — alle 5s Suggestions neu laden
    pollRef.current = setInterval(async () => {
      try {
        const data = await get<RelationData[]>('/api/relations?status=suggested')
        setSuggestions(data)
      } catch { /* Polling-Fehler ignorieren */ }
    }, 5000)

    try {
      const result = await post<{
        suggested: number; rounds: number; total_concepts: number
      }>('/api/relations/detect')
      const msg = language === 'de'
        ? `${result.suggested} neue Vorschläge aus ${result.rounds} Runden (${result.total_concepts} Konzepte)`
        : `${result.suggested} new suggestions from ${result.rounds} rounds (${result.total_concepts} concepts)`
      setDetectResult(msg)
      await loadSuggestions()
      onChanged?.()
    } catch (err) {
      console.error('Detect fehlgeschlagen:', err)
      setDetectResult(language === 'de' ? 'Fehler bei Erkennung' : 'Detection failed')
    } finally {
      setDetecting(false)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }

  // Alle Suggestions löschen
  const handleClearSuggestions = async () => {
    const label = language === 'de' ? 'Alle Vorschläge löschen?' : 'Delete all suggestions?'
    if (!confirm(label)) return
    try {
      const result = await del<{ deleted: number }>('/api/relations/suggestions')
      const msg = language === 'de'
        ? `${result.deleted} Vorschläge gelöscht`
        : `${result.deleted} suggestions deleted`
      setCleanupMsg(msg)
      setSuggestions([])
      onChanged?.()
    } catch (err) { console.error('Clear fehlgeschlagen:', err) }
  }

  // Verwaiste Konzepte aufräumen
  const handleCleanOrphans = async () => {
    try {
      const result = await del<{ deleted: number }>('/api/concepts/orphaned')
      const msg = language === 'de'
        ? `${result.deleted} verwaiste Konzepte gelöscht`
        : `${result.deleted} orphaned concepts deleted`
      setCleanupMsg(msg)
      onChanged?.()
    } catch (err) { console.error('Cleanup fehlgeschlagen:', err) }
  }

  // Bestätigen / Ablehnen
  const handleConfirm = async (id: number) => {
    try {
      await put(`/api/relations/${id}/confirm`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
      onChanged?.()
    } catch (err) { console.error('Bestätigung fehlgeschlagen:', err) }
  }

  const handleReject = async (id: number) => {
    try {
      await put(`/api/relations/${id}/reject`)
      setSuggestions(prev => prev.filter(s => s.id !== id))
      onChanged?.()
    } catch (err) { console.error('Ablehnung fehlgeschlagen:', err) }
  }

  const handleConfirmAll = async () => {
    for (const s of suggestions) await put(`/api/relations/${s.id}/confirm`)
    setSuggestions([])
    onChanged?.()
  }

  const handleRejectAll = async () => {
    for (const s of suggestions) await put(`/api/relations/${s.id}/reject`)
    setSuggestions([])
    onChanged?.()
  }

  // Edit-Modal
  const handleEdit = (s: RelationData) => {
    setEditTarget({
      mode: 'relation', id: s.id,
      sourceTitle: s.source_title || `Konzept #${s.source_id}`,
      targetTitle: s.target_title || `Konzept #${s.target_id}`,
      typeId: s.relation_type?.id || 0,
      reason: s.reason || '',
    })
  }

  const typeLabel = (rt: RelationData['relation_type']) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  const navigateToSource = (type: string, id: number) => {
    if (type === 'note') navigate(`/notes?open=${id}`)
    else if (type === 'summary' || type === 'module') navigate(`/modules/${id}`)
  }

  return (
    <div className="space-y-4">
      {/* Header + Aktionen */}
      <div className="flex items-center justify-between">
        <h3 className="hud-title text-glow text-lg">
          {language === 'de' ? 'AI-VORSCHLÄGE' : 'AI SUGGESTIONS'}
          {suggestions.length > 0 && (
            <span className="ml-2 text-sm" style={{ color: 'var(--color-warning)' }}>
              ({suggestions.length})
            </span>
          )}
        </h3>
        <div className="flex gap-2 items-center">
          <button onClick={handleCleanOrphans}
            className="hud-btn text-xs px-2 py-0.5"
            style={{ borderColor: 'var(--color-text-muted)', color: 'var(--color-text-muted)' }}>
            {language === 'de' ? 'Verwaiste aufräumen' : 'Clean Orphans'}
          </button>
          {suggestions.length > 0 && !detecting && (
            <button onClick={handleClearSuggestions}
              className="hud-btn text-xs px-2 py-0.5"
              style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
              {language === 'de' ? 'Alle löschen' : 'Clear All'}
            </button>
          )}
          <button onClick={handleDetect} disabled={detecting}
            className="hud-btn text-sm">
            {detecting
              ? (language === 'de' ? 'Analysiere' : 'Analyzing')
              : (language === 'de' ? 'Relationen erkennen' : 'Detect Relations')}
            <LoadingDot active={detecting} />
          </button>
        </div>
      </div>

      {/* Feedback-Nachricht */}
      {(detectResult || cleanupMsg) && (
        <p className="text-xs px-3 py-2 rounded"
          style={{ background: 'var(--color-hover-bg)', color: 'var(--color-text-secondary)' }}>
          {detectResult || cleanupMsg}
        </p>
      )}

      {/* Detect-Hinweis */}
      {detecting && (
        <p className="text-xs px-3 py-2 rounded animate-pulse"
          style={{ background: 'rgba(0, 212, 255, 0.05)', color: 'var(--color-primary)' }}>
          {language === 'de'
            ? `10 Runden laufen — ${suggestions.length} Vorschläge bisher...`
            : `Running 10 rounds — ${suggestions.length} suggestions so far...`}
        </p>
      )}

      {/* Batch-Aktionen */}
      {suggestions.length > 1 && !detecting && (
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
      ) : suggestions.length === 0 && !detecting ? (
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
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="cursor-pointer hover:underline"
                  style={{ color: 'var(--color-text-primary)' }}
                  onDoubleClick={() => navigateToSource(s.source_type, s.source_id)}>
                  {s.source_title || `Konzept #${s.source_id}`}
                </span>
                <span className="font-semibold px-2 py-0.5 rounded text-xs"
                  style={{ color: 'var(--color-warning)', background: 'rgba(255, 170, 0, 0.1)' }}>
                  {typeLabel(s.relation_type)}
                </span>
                <span className="cursor-pointer hover:underline"
                  style={{ color: 'var(--color-text-primary)' }}
                  onDoubleClick={() => navigateToSource(s.target_type, s.target_id)}>
                  {s.target_title || `Konzept #${s.target_id}`}
                </span>
              </div>
              {s.reason && (
                <p className="text-xs mt-1.5"
                  style={{ color: 'var(--color-text-secondary)' }}>
                  {s.reason}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleEdit(s)}
                  className="hud-btn text-xs px-2 py-0.5"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                  {language === 'de' ? 'Bearbeiten' : 'Edit'}
                </button>
                <button onClick={() => handleConfirm(s.id)}
                  className="hud-btn text-xs px-2 py-0.5"
                  style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
                  {language === 'de' ? 'Bestätigen' : 'Confirm'}
                </button>
                <button onClick={() => handleReject(s.id)}
                  className="hud-btn text-xs px-2 py-0.5"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                  {language === 'de' ? 'Ablehnen' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <OntologyEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { loadSuggestions(); onChanged?.() }}
        />
      )}
    </div>
  )
}
