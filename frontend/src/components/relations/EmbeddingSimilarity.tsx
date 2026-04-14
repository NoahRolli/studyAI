// EmbeddingSimilarity — Generiert Embeddings + findet ähnliche Konzepte
// SSE-Stream mit Live-Progress (Embeddings + Similarity-Berechnung)

import { useState, useEffect, useRef } from 'react'
import { del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

interface Props {
  onChanged?: () => void
}

interface Progress {
  phase: string
  message: string
  embDone?: number
  embTotal?: number
  pairsChecked?: number
  totalPairs?: number
  edgesCreated?: number
}

export default function EmbeddingSimilarity({ onChanged }: Props) {
  const { language } = useLanguage()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => () => { esRef.current?.close() }, [])

  const handleRun = () => {
    setRunning(true)
    setResult(null)
    setProgress({ phase: 'start', message: 'Starte...' })

    const es = new EventSource('/api/concepts/embeddings/stream?threshold=0.65')
    esRef.current = es

    es.addEventListener('status', (e) => {
      const d = JSON.parse(e.data)
      setProgress(prev => ({ ...prev!, phase: d.phase, message: d.message }))
    })

    es.addEventListener('embedding_progress', (e) => {
      const d = JSON.parse(e.data)
      setProgress(prev => ({
        ...prev!, phase: 'embeddings',
        message: language === 'de'
          ? `Embeddings: ${d.done}/${d.total}`
          : `Embeddings: ${d.done}/${d.total}`,
        embDone: d.done, embTotal: d.total,
      }))
    })

    es.addEventListener('similarity_progress', (e) => {
      const d = JSON.parse(e.data)
      setProgress(prev => ({
        ...prev!, phase: 'similarity',
        message: language === 'de'
          ? `Paare: ${d.pairs_checked}/${d.total_pairs} — ${d.edges_created} Treffer`
          : `Pairs: ${d.pairs_checked}/${d.total_pairs} — ${d.edges_created} matches`,
        pairsChecked: d.pairs_checked, totalPairs: d.total_pairs,
        edgesCreated: d.edges_created,
      }))
    })

    es.addEventListener('complete', (e) => {
      const d = JSON.parse(e.data)
      const msg = language === 'de'
        ? `${d.embeddings_updated} Embeddings, ${d.edges_created} neue Similarity-Edges (Threshold: ${d.threshold})`
        : `${d.embeddings_updated} embeddings, ${d.edges_created} new similarity edges (threshold: ${d.threshold})`
      setResult(msg)
      setRunning(false)
      setProgress(null)
      es.close()
      esRef.current = null
      onChanged?.()
    })

    es.onerror = () => {
      setRunning(false)
      setProgress(null)
      setResult(language === 'de' ? 'Verbindung unterbrochen' : 'Connection lost')
      es.close()
      esRef.current = null
    }
  }

  const handleCancel = () => {
    esRef.current?.close()
    esRef.current = null
    setRunning(false)
    setProgress(null)
    onChanged?.()
  }

  const handleClearEdges = async () => {
    const label = language === 'de'
      ? 'Alle Similarity-Edges löschen?' : 'Delete all similarity edges?'
    if (!confirm(label)) return
    const r = await del<{ deleted: number }>('/api/concepts/embeddings/similarity-edges')
    setResult(`${r.deleted} ${language === 'de' ? 'gelöscht' : 'deleted'}`)
    onChanged?.()
  }

  // Fortschrittsbalken Prozent
  const pct = progress?.phase === 'embeddings' && progress.embTotal
    ? Math.round(((progress.embDone || 0) / progress.embTotal) * 100)
    : progress?.phase === 'similarity' && progress.totalPairs
      ? Math.round(((progress.pairsChecked || 0) / progress.totalPairs) * 100)
      : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button onClick={handleRun} disabled={running} className="hud-btn-sm">
          {running
            ? (language === 'de' ? 'Läuft...' : 'Running...')
            : 'Embedding Similarity'}
        </button>
        {running && (
          <button onClick={handleCancel} className="hud-btn-sm"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
            {language === 'de' ? 'Abbrechen' : 'Cancel'}
          </button>
        )}
        <button onClick={handleClearEdges} disabled={running}
          className="hud-btn-sm"
          style={{ borderColor: 'var(--color-text-muted)', color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Similarity-Edges löschen' : 'Clear Similarity Edges'}
        </button>
      </div>

      {progress && (
        <div>
          <p className="text-xs animate-pulse" style={{ color: 'var(--color-primary)' }}>
            {progress.message}
          </p>
          <div className="h-1 mt-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(0, 212, 255, 0.1)' }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
          </div>
        </div>
      )}

      {result && (
        <p className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--color-hover-bg)', color: 'var(--color-text-secondary)' }}>
          {result}
        </p>
      )}
    </div>
  )
}
