// RelationSuggestions — Globale Queue aller AI-Vorschläge
// SSE-Stream für Live-Progress bei Detect (EventSource API)
// Cleanup: Suggestions löschen + verwaiste Konzepte aufräumen

import { useState, useEffect, useCallback, useRef } from 'react'
import { get, put, del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import DetectProgressPanel from './DetectProgressPanel'
import SuggestionCard from './SuggestionCard'
import OntologyEditModal from './OntologyEditModal'
import type { EditTarget } from './OntologyEditModal'
import type { RelationData } from '../../types/relations'

interface Props { onChanged?: () => void }

interface RoundLog {
  round: number; total: number
  status: 'running' | 'done' | 'error'
  created?: number; totalCreated?: number
  provider?: string; roundTime?: number; error?: string
}

export default function RelationSuggestions({ onChanged }: Props) {
  const { language } = useLanguage()
  const [suggestions, setSuggestions] = useState<RelationData[]>([])
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const [roundLogs, setRoundLogs] = useState<RoundLog[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [totalCreated, setTotalCreated] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await get<RelationData[]>('/api/relations?status=suggested')
      setSuggestions(data)
    } catch (err) { console.error('Laden fehlgeschlagen:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadSuggestions() }, [loadSuggestions])
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (esRef.current) esRef.current.close()
  }, [])

  // SSE-Detect
  const handleDetect = () => {
    setDetecting(true)
    setDetectResult(null)
    setCleanupMsg(null)
    setRoundLogs([])
    setTotalCreated(0)
    setElapsed(0)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000))
    }, 1000)

    const es = new EventSource('/api/relations/detect/stream?rounds=10')
    esRef.current = es

    es.addEventListener('round_start', (e) => {
      const d = JSON.parse(e.data)
      setRoundLogs(prev => [...prev, {
        round: d.round, total: d.total, status: 'running',
      }])
    })
    es.addEventListener('round_done', (e) => {
      const d = JSON.parse(e.data)
      setTotalCreated(d.total_created)
      setRoundLogs(prev => prev.map(r =>
        r.round === d.round ? {
          ...r, status: 'done' as const, created: d.created,
          totalCreated: d.total_created, provider: d.provider,
          roundTime: d.round_time,
        } : r
      ))
      loadSuggestions()
    })
    es.addEventListener('round_error', (e) => {
      const d = JSON.parse(e.data)
      setRoundLogs(prev => prev.map(r =>
        r.round === d.round
          ? { ...r, status: 'error' as const, error: d.error } : r
      ))
    })
    es.addEventListener('complete', (e) => {
      const d = JSON.parse(e.data)
      const msg = language === 'de'
        ? `${d.suggested} Vorschläge aus ${d.rounds} Runden (${d.elapsed}s)`
        : `${d.suggested} suggestions from ${d.rounds} rounds (${d.elapsed}s)`
      setDetectResult(msg)
      cleanup()
      loadSuggestions()
      onChanged?.()
    })
    es.onerror = () => {
      setDetectResult(language === 'de' ? 'Verbindung unterbrochen' : 'Connection lost')
      cleanup()
      loadSuggestions()
    }
  }

  const cleanup = () => {
    setDetecting(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }

  const handleClear = async () => {
    if (!confirm(language === 'de' ? 'Alle Vorschläge löschen?' : 'Delete all?')) return
    const r = await del<{ deleted: number }>('/api/relations/suggestions')
    setCleanupMsg(`${r.deleted} ${language === 'de' ? 'gelöscht' : 'deleted'}`)
    setSuggestions([])
    onChanged?.()
  }

  const handleCleanOrphans = async () => {
    const r = await del<{ deleted: number }>('/api/concepts/orphaned')
    setCleanupMsg(`${r.deleted} ${language === 'de' ? 'verwaiste gelöscht' : 'orphans deleted'}`)
    onChanged?.()
  }

  const handleConfirm = async (id: number) => {
    await put(`/api/relations/${id}/confirm`)
    setSuggestions(prev => prev.filter(s => s.id !== id))
    onChanged?.()
  }
  const handleReject = async (id: number) => {
    await put(`/api/relations/${id}/reject`)
    setSuggestions(prev => prev.filter(s => s.id !== id))
    onChanged?.()
  }
  const handleEdit = (s: RelationData) => {
    setEditTarget({
      mode: 'relation', id: s.id,
      sourceTitle: s.source_title || `#${s.source_id}`,
      targetTitle: s.target_title || `#${s.target_id}`,
      typeId: s.relation_type?.id || 0, reason: s.reason || '',
    })
  }

  return (
    <div className="space-y-4">
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
            <button onClick={handleClear}
              className="hud-btn text-xs px-2 py-0.5"
              style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
              {language === 'de' ? 'Alle löschen' : 'Clear All'}
            </button>
          )}
          <button onClick={handleDetect} disabled={detecting} className="hud-btn text-sm">
            {detecting
              ? (language === 'de' ? 'Analysiere...' : 'Analyzing...')
              : (language === 'de' ? 'Relationen erkennen' : 'Detect Relations')}
          </button>
        </div>
      </div>

      {(detecting || roundLogs.length > 0) && (
        <DetectProgressPanel rounds={roundLogs} elapsed={elapsed}
          active={detecting} totalCreated={totalCreated} />
      )}
      {(detectResult || cleanupMsg) && (
        <p className="text-xs px-3 py-2 rounded"
          style={{ background: 'var(--color-hover-bg)', color: 'var(--color-text-secondary)' }}>
          {detectResult || cleanupMsg}
        </p>
      )}
      {suggestions.length > 1 && !detecting && (
        <div className="flex gap-2">
          <button onClick={async () => {
            for (const s of suggestions) await put(`/api/relations/${s.id}/confirm`)
            setSuggestions([]); onChanged?.()
          }} className="text-xs" style={{ color: 'var(--color-success)' }}>
            {language === 'de' ? 'Alle bestätigen' : 'Confirm all'}
          </button>
          <span style={{ color: 'var(--color-text-muted)' }}>|</span>
          <button onClick={async () => {
            for (const s of suggestions) await put(`/api/relations/${s.id}/reject`)
            setSuggestions([]); onChanged?.()
          }} className="text-xs" style={{ color: 'var(--color-danger)' }}>
            {language === 'de' ? 'Alle ablehnen' : 'Reject all'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Laden...' : 'Loading...'}
        </p>
      ) : suggestions.length === 0 && !detecting ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de'
            ? 'Keine Vorschläge. Klicke "Relationen erkennen".'
            : 'No suggestions. Click "Detect Relations".'}
        </p>
      ) : (
        <div className="space-y-2">
          {suggestions.map(s => (
            <SuggestionCard key={s.id} suggestion={s}
              onConfirm={handleConfirm} onReject={handleReject}
              onEdit={handleEdit} />
          ))}
        </div>
      )}

      {editTarget && (
        <OntologyEditModal target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { loadSuggestions(); onChanged?.() }} />
      )}
    </div>
  )
}
