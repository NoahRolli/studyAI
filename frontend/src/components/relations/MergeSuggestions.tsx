// MergeSuggestions — Duplikat-Erkennung und Merge-UI
// Embedding-Similarity findet Kandidaten, AI liefert Begruendung
// Merge-Aktion nutzt bestehenden POST /api/concepts/merge

import { useState, useEffect } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

interface MergePair {
  concept_a: { id: number; name: string }
  concept_b: { id: number; name: string }
  similarity: number
  reason: string | null
  ai_merge?: boolean
  model_used?: string
}

export default function MergeSuggestions() {
  const { language } = useLanguage()
  const [pairs, setPairs] = useState<MergePair[]>([])
  const [loading, setLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [threshold, setThreshold] = useState(0.82)
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    const raw = localStorage.getItem('pallas-merge-dismissed')
    return raw ? new Set(JSON.parse(raw)) : new Set()
  })

  const pairKey = (a: number, b: number) => `${a}-${b}`

  const saveDismissed = (next: Set<string>) => {
    setDismissed(next)
    localStorage.setItem('pallas-merge-dismissed', JSON.stringify([...next]))
  }

  const loadSuggestions = async () => {
    setLoading(true)
    try {
      const data = await get<{ pairs: MergePair[]; total: number }>(
        `/api/concepts/merge-suggestions?threshold=${threshold}&ai_reason=${aiMode}`
      )
      setPairs(data.pairs)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadSuggestions() }, [])

  const handleMerge = async (sourceId: number, targetId: number) => {
    try {
      await post('/api/concepts/merge', {
        source_id: sourceId,
        target_id: targetId,
      })
      // Alle Paare entfernen die die gemergte Source-ID referenzieren
      // (Source existiert nach Merge nicht mehr in der DB)
      setPairs(prev => prev.filter(
        p => p.concept_a.id !== sourceId && p.concept_b.id !== sourceId
      ))
    } catch (err) {
      console.error(err)
      // Bei 404: Konzept wurde durch frueheren Merge bereits konsumiert
      // → Paar aus Liste entfernen damit UI nicht haengen bleibt
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('404') || msg.includes('nicht gefunden')) {
        setPairs(prev => prev.filter(
          p => p.concept_a.id !== sourceId && p.concept_a.id !== targetId
            && p.concept_b.id !== sourceId && p.concept_b.id !== targetId
        ))
      }
    }
  }

  const handleDismiss = (a: number, b: number) => {
    const next = new Set(dismissed)
    next.add(pairKey(a, b))
    saveDismissed(next)
  }

  const visible = pairs.filter(
    p => !dismissed.has(pairKey(p.concept_a.id, p.concept_b.id))
  )

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Threshold
          </label>
          <input type="range" min="0.5" max="0.99" step="0.01"
            value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
            className="hud-slider w-24" />
          <span className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>
            {threshold.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAiMode(!aiMode)}
            className="text-xs px-2 py-1 rounded border transition-all"
            style={{
              borderColor: aiMode ? 'var(--color-primary)' : 'var(--color-border)',
              background: aiMode ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
              color: aiMode ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}>
            AI {language === 'de' ? 'Analyse' : 'Analysis'}
          </button>
          <button onClick={loadSuggestions} disabled={loading}
            className="hud-btn-sm">
            {loading
              ? (language === 'de' ? 'Scanne...' : 'Scanning...')
              : (language === 'de' ? 'Scannen' : 'Scan')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {visible.length} {language === 'de' ? 'Kandidaten' : 'candidates'}
        {dismissed.size > 0 && (
          <button onClick={() => saveDismissed(new Set())}
            className="ml-2 underline"
            style={{ color: 'var(--color-text-muted)' }}>
            Reset ({dismissed.size})
          </button>
        )}
      </p>

      {/* Paare */}
      {visible.length === 0 && !loading && (
        <div className="hud-card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine Duplikate gefunden. Threshold senken fuer mehr Ergebnisse.'
              : 'No duplicates found. Lower threshold for more results.'}
          </p>
        </div>
      )}

      {visible.map(p => (
        <div key={pairKey(p.concept_a.id, p.concept_b.id)}
          className="hud-card p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-medium truncate"
                style={{ color: 'var(--color-primary)' }}>{p.concept_a.name}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>↔</span>
              <span className="text-sm font-medium truncate"
                style={{ color: 'var(--color-primary)' }}>{p.concept_b.name}</span>
            </div>
            <span className="text-xs font-mono ml-2 shrink-0"
              style={{ color: p.similarity >= 0.9 ? 'var(--color-danger)' : 'var(--color-warning, #c89632)' }}>
              {(p.similarity * 100).toFixed(1)}%
            </span>
          </div>

          {p.reason && (
            <p className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
              {p.reason}
              {p.model_used && (
                <span className="ml-2" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                  [{p.model_used}]
                </span>
              )}
            </p>
          )}

          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => handleDismiss(p.concept_a.id, p.concept_b.id)}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              {language === 'de' ? 'Ignorieren' : 'Dismiss'}
            </button>
            <button onClick={() => handleMerge(p.concept_a.id, p.concept_b.id)}
              className="text-xs px-2 py-1 rounded border transition-all"
              style={{
                borderColor: 'rgba(0, 200, 100, 0.5)',
                color: 'var(--color-success)',
                background: 'rgba(0, 200, 100, 0.08)',
              }}>
              {language === 'de' ? `Merge → ${p.concept_b.name}` : `Merge → ${p.concept_b.name}`}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
