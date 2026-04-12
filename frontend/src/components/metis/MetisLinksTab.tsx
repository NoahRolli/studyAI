// MetisLinksTab — Review aller AI-Edge-Vorschlaege
// Zeigt nur pending Edges, Filter nach Relationstyp
// Confirmed Edges sind in OntologyOverview sichtbar

import { useState, useEffect, useCallback, useMemo } from 'react'
import { get, put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { ConceptGraph, ConceptNode } from '../../types/metis'

type SortMode = 'weakest' | 'strongest'

export default function MetisLinksTab() {
  const { t, language } = useLanguage()
  const [graph, setGraph] = useState<ConceptGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [filterRelation, setFilterRelation] = useState('all')
  const [sort, setSort] = useState<SortMode>('weakest')

  const loadGraph = useCallback(async () => {
    try {
      const data = await get<ConceptGraph>('/api/concepts/graph')
      setGraph(data)
    } catch (err) {
      console.error('Graph laden fehlgeschlagen:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  // Nur pending Edges (positive IDs)
  const pendingEdges = useMemo(() => {
    if (!graph) return []
    return graph.edges.filter(e =>
      e.id > 0 && e.status === 'suggested'
    )
  }, [graph])

  // Verfuegbare Relationstypen aus den Edges
  const relationTypes = useMemo(() => {
    const types = new Set(pendingEdges.map(e =>
      typeof e.relation_type === 'object' ? e.relation_type?.name || 'unknown' : e.relation_type || 'unknown'
    ))
    return Array.from(types).sort()
  }, [pendingEdges])

  // Gefiltert + sortiert
  const filtered = useMemo(() => {
    let edges = pendingEdges
    if (filterRelation !== 'all') {
      edges = edges.filter(e => (typeof e.relation_type === 'object' ? e.relation_type?.name || 'unknown' : e.relation_type || 'unknown') === filterRelation)
    }
    if (sort === 'weakest') {
      edges = [...edges].sort((a, b) => (a.strength ?? 0) - (b.strength ?? 0))
    } else {
      edges = [...edges].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    }
    return edges
  }, [pendingEdges, filterRelation, sort])

  // Node-Titel finden
  const nodeTitle = (nodeId: number): ConceptNode | undefined =>
    graph?.nodes.find(n => n.id === nodeId)

  // Confirm/Reject — nutzt /api/relations Endpoints
  const handleReview = async (
    edgeId: number, action: 'confirm' | 'reject',
  ) => {
    try {
      await put(`/api/relations/${edgeId}/${action}`, {
        reason: reason || null,
      })
      setReviewing(null)
      setReason('')
      await loadGraph()
    } catch (err) {
      console.error('Review fehlgeschlagen:', err)
    }
  }

  if (loading) return (
    <p style={{ color: 'var(--color-text-muted)' }}>
      {language === 'de' ? 'Laden...' : 'Loading...'}
    </p>
  )

  return (
    <div>
      {/* Statistik */}
      <div className="flex gap-4 text-xs mb-4"
        style={{ color: 'var(--color-text-secondary)' }}>
        <span style={{ color: 'var(--color-warning)' }}>
          {pendingEdges.length} {language === 'de' ? 'offen' : 'pending'}
        </span>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={filterRelation}
          onChange={e => setFilterRelation(e.target.value)}
          className="hud-input text-xs">
          <option value="all">
            {language === 'de' ? 'Alle Typen' : 'All types'}
          </option>
          {relationTypes.map(rt => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
        <select value={sort}
          onChange={e => setSort(e.target.value as SortMode)}
          className="hud-input text-xs">
          <option value="weakest">
            {language === 'de' ? 'Schwaechste zuerst' : 'Weakest first'}
          </option>
          <option value="strongest">
            {language === 'de' ? 'Staerkste zuerst' : 'Strongest first'}
          </option>
        </select>
      </div>

      {/* Edge-Liste */}
      {filtered.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine offenen Verbindungen.'
              : 'No pending links.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(edge => {
            const src = nodeTitle(edge.source)
            const tgt = nodeTitle(edge.target)
            if (!src || !tgt) return null
            const relName = edgtypeof e.relation_type === 'object' ? e.relation_type?.name || 'unknown' : e.relation_type || 'unknown'
            return (
              <div key={edge.id} className="hud-card px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {src.name}
                  </span>
                  <span className="text-xs"
                    style={{ color: 'var(--color-text-muted)' }}>
                    \u2194
                  </span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {tgt.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px]"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <span>{relName}</span>
                  <span>{((edge.strength ?? 0) * 100).toFixed(0)}%</span>
                  {edge.reason && (
                    <span className="truncate max-w-48">
                      — {edge.reason}
                    </span>
                  )}
                </div>
                {reviewing === edge.id ? (
                  <div className="mt-2 space-y-1">
                    <input type="text" value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder={t.metis?.reasonPlaceholder || 'Reason...'}
                      className="hud-input w-full text-[10px] px-2 py-1" />
                    <div className="flex gap-1">
                      <button onClick={() => handleReview(edge.id, 'confirm')}
                        className="flex-1 text-[10px] px-2 py-1 rounded"
                        style={{ backgroundColor: '#4ade8025',
                          color: '#4ade80' }}>
                        {t.metis?.confirm || 'Confirm'}
                      </button>
                      <button onClick={() => handleReview(edge.id, 'reject')}
                        className="flex-1 text-[10px] px-2 py-1 rounded"
                        style={{ backgroundColor: '#ef444425',
                          color: '#ef4444' }}>
                        {t.metis?.reject || 'Reject'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setReviewing(edge.id)}
                    className="mt-2 text-[10px] px-2 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-hover-bg)',
                      color: 'var(--color-text-secondary)' }}>
                    {t.metis?.confirm || 'Confirm'} / {t.metis?.reject || 'Reject'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
