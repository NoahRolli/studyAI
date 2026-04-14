// MetisLinksTab — Review aller AI-Edge-Vorschläge aus dem Konzept-Graph
// Gleiche Button-Struktur wie RelationSuggestions (Edit/Confirm/Reject)
// Doppelklick auf Konzept → navigiert zur Quelle
// Evidence: zeigt gemeinsame Quellen bei Klick

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { ConceptGraph, ConceptNode } from '../../types/metis'

type SortMode = 'weakest' | 'strongest'

interface EvidenceData {
  source: { name: string; sources: { type: string; id: number; title: string; excerpt: string; url: string | null }[] }
  target: { name: string; sources: { type: string; id: number; title: string; excerpt: string; url: string | null }[] }
  shared_sources: { type: string; id: number; title: string; url: string | null }[]
  reason: string
}

export default function MetisLinksTab() {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [graph, setGraph] = useState<ConceptGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterRelation, setFilterRelation] = useState('all')
  const [sort, setSort] = useState<SortMode>('weakest')
  const [evidence, setEvidence] = useState<Record<number, EvidenceData>>({})
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const loadGraph = useCallback(async () => {
    try {
      const data = await get<ConceptGraph>('/api/concepts/graph')
      setGraph(data)
    } catch (err) {
      console.error('Graph laden fehlgeschlagen:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  const pendingEdges = useMemo(() => {
    if (!graph) return []
    return graph.edges.filter(e => e.id > 0 && e.status === 'suggested')
  }, [graph])

  const relationTypes = useMemo(() => {
    const types = new Set(pendingEdges.map(e =>
      typeof e.relation_type === 'object' ? e.relation_type?.name || 'unknown' : e.relation_type || 'unknown'
    ))
    return Array.from(types).sort()
  }, [pendingEdges])

  const filtered = useMemo(() => {
    let edges = pendingEdges
    if (filterRelation !== 'all') {
      edges = edges.filter(e => {
        const name = typeof e.relation_type === 'object' ? e.relation_type?.name : e.relation_type
        return (name || 'unknown') === filterRelation
      })
    }
    return sort === 'weakest'
      ? [...edges].sort((a, b) => (a.strength ?? 0) - (b.strength ?? 0))
      : [...edges].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
  }, [pendingEdges, filterRelation, sort])

  const nodeTitle = (nodeId: number): ConceptNode | undefined =>
    graph?.nodes.find(n => n.id === nodeId)

  const handleReview = async (edgeId: number, action: 'confirm' | 'reject') => {
    try {
      await put(`/api/relations/${edgeId}/${action}`)
      await loadGraph()
    } catch (err) { console.error('Review fehlgeschlagen:', err) }
  }

  const loadEvidence = async (edgeId: number) => {
    if (expandedId === edgeId) { setExpandedId(null); return }
    if (!evidence[edgeId]) {
      try {
        const data = await get<EvidenceData>(`/api/relations/${edgeId}/evidence`)
        setEvidence(prev => ({ ...prev, [edgeId]: data }))
      } catch (err) { console.error('Evidence laden fehlgeschlagen:', err) }
    }
    setExpandedId(edgeId)
  }

  const navigateToSource = (url: string | null) => {
    if (url) navigate(url)
  }

  if (loading) return (
    <p style={{ color: 'var(--color-text-muted)' }}>
      {language === 'de' ? 'Laden...' : 'Loading...'}
    </p>
  )

  return (
    <div>
      <div className="flex gap-4 text-xs mb-4"
        style={{ color: 'var(--color-text-secondary)' }}>
        <span style={{ color: 'var(--color-warning)' }}>
          {pendingEdges.length} {language === 'de' ? 'offen' : 'pending'}
        </span>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filterRelation}
          onChange={e => setFilterRelation(e.target.value)}
          className="hud-input text-xs">
          <option value="all">{language === 'de' ? 'Alle Typen' : 'All types'}</option>
          {relationTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
        </select>
        <select value={sort}
          onChange={e => setSort(e.target.value as SortMode)}
          className="hud-input text-xs">
          <option value="weakest">{language === 'de' ? 'Schwächste zuerst' : 'Weakest first'}</option>
          <option value="strongest">{language === 'de' ? 'Stärkste zuerst' : 'Strongest first'}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de' ? 'Keine offenen Verbindungen.' : 'No pending links.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(edge => {
            const src = nodeTitle(edge.source)
            const tgt = nodeTitle(edge.target)
            if (!src || !tgt) return null
            const relName = typeof edge.relation_type === 'object' && edge.relation_type
              ? edge.relation_type.name : (edge.relation_type || 'unknown')
            const ev = expandedId === edge.id ? evidence[edge.id] : null

            return (
              <div key={edge.id} className="p-3 rounded-lg border"
                style={{ background: 'var(--color-bg-surface)', borderColor: 'rgba(255, 170, 0, 0.2)' }}>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onDoubleClick={() => loadEvidence(edge.id)}>
                    {src.name}
                  </span>
                  <span className="font-semibold px-2 py-0.5 rounded text-xs"
                    style={{ color: 'var(--color-warning)', background: 'rgba(255, 170, 0, 0.1)' }}>
                    {relName}
                  </span>
                  <span className="cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onDoubleClick={() => loadEvidence(edge.id)}>
                    {tgt.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {((edge.strength ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>

                {edge.reason && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {edge.reason}
                  </p>
                )}

                <div className="flex gap-2 mt-2">
                  <button onClick={() => loadEvidence(edge.id)}
                    className="hud-btn-sm"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                    {language === 'de' ? 'Quellen' : 'Evidence'}
                  </button>
                  <button onClick={() => handleReview(edge.id, 'confirm')}
                    className="hud-btn-sm"
                    style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
                    {language === 'de' ? 'Bestätigen' : 'Confirm'}
                  </button>
                  <button onClick={() => handleReview(edge.id, 'reject')}
                    className="hud-btn-sm"
                    style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                    {language === 'de' ? 'Ablehnen' : 'Reject'}
                  </button>
                </div>

                {ev && (
                  <div className="mt-3 p-2 rounded text-xs space-y-2"
                    style={{ background: 'var(--color-bg-base)' }}>
                    {ev.shared_sources.length > 0 && (
                      <div>
                        <span className="font-medium" style={{ color: 'var(--color-primary)' }}>
                          {language === 'de' ? 'Gemeinsame Quellen:' : 'Shared sources:'}
                        </span>
                        {ev.shared_sources.map((s, i) => (
                          <span key={i} className="ml-2 cursor-pointer hover:underline"
                            style={{ color: 'var(--color-text-secondary)' }}
                            onClick={() => navigateToSource(s.url)}>
                            {s.title}
                          </span>
                        ))}
                      </div>
                    )}
                    <div>
                      <span className="font-medium" style={{ color: 'var(--color-primary)' }}>
                        {ev.source.name}:
                      </span>
                      {ev.source.sources.map((s, i) => (
                        <span key={i} className="ml-2 cursor-pointer hover:underline"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => navigateToSource(s.url)}>
                          {s.title}
                        </span>
                      ))}
                    </div>
                    <div>
                      <span className="font-medium" style={{ color: 'var(--color-primary)' }}>
                        {ev.target.name}:
                      </span>
                      {ev.target.sources.map((s, i) => (
                        <span key={i} className="ml-2 cursor-pointer hover:underline"
                          style={{ color: 'var(--color-text-secondary)' }}
                          onClick={() => navigateToSource(s.url)}>
                          {s.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
