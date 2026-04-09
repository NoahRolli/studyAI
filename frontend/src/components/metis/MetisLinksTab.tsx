// MetisLinksTab — Review aller AI-Edge-Vorschläge
// Zeigt nur pending Edges, Filter nach Relationstyp
// Confirmed Edges sind in OntologyOverview sichtbar

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { MetisGraph, MetisNode } from '../../types/metis'

type SortMode = 'weakest' | 'strongest'

export default function MetisLinksTab() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const [graph, setGraph] = useState<MetisGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [filterRelation, setFilterRelation] = useState('all')
  const [sort, setSort] = useState<SortMode>('weakest')

  const loadGraph = useCallback(async () => {
    try {
      const data = await get<MetisGraph>('/api/metis/graph')
      setGraph(data)
    } catch (err) {
      console.error('Graph laden fehlgeschlagen:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  // Nur pending Edges (kein WikiLink, positive IDs)
  const pendingEdges = useMemo(() => {
    if (!graph) return []
    return graph.edges.filter(e =>
      e.id > 0 && e.status === 'suggested' && e.relation_type !== 'wikilink'
    )
  }, [graph])

  // Verfügbare Relationstypen aus den Edges
  const relationTypes = useMemo(() => {
    const types = new Set(pendingEdges.map(e => e.relation_type))
    return Array.from(types).sort()
  }, [pendingEdges])

  // Gefiltert + sortiert
  const filtered = useMemo(() => {
    let edges = pendingEdges
    if (filterRelation !== 'all') {
      edges = edges.filter(e => e.relation_type === filterRelation)
    }
    if (sort === 'weakest') {
      edges = [...edges].sort((a, b) => a.strength - b.strength)
    } else {
      edges = [...edges].sort((a, b) => b.strength - a.strength)
    }
    return edges
  }, [pendingEdges, filterRelation, sort])

  // Node-Titel finden
  const nodeTitle = (nodeId: number): MetisNode | undefined =>
    graph?.nodes.find(n => n.id === nodeId)

  // Navigation
  const navigateTo = (node: MetisNode) => {
    if (node.type === 'note') navigate(`/notes?open=${node.source_id}`)
    else if (node.type === 'summary' && node.module_id) {
      navigate(`/modules/${node.module_id}`)
    } else navigate('/archiv')
  }

  // Confirm/Reject
  const handleReview = async (
    edgeId: number, action: 'confirm' | 'reject',
  ) => {
    try {
      await put(`/api/metis/edges/${edgeId}/${action}`, {
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
            {language === 'de' ? 'Schwächste zuerst' : 'Weakest first'}
          </option>
          <option value="strongest">
            {language === 'de' ? 'Stärkste zuerst' : 'Strongest first'}
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
            const src = nodeTitle(edge.source_node_id)
            const tgt = nodeTitle(edge.target_node_id)
            if (!src || !tgt) return null
            return (
              <div key={edge.id} className="hud-card px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => navigateTo(src)}>
                    {src.title}
                  </span>
                  <span className="text-xs"
                    style={{ color: 'var(--color-text-muted)' }}>
                    ↔
                  </span>
                  <span className="cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => navigateTo(tgt)}>
                    {tgt.title}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px]"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <span>{edge.relation_type}</span>
                  <span>{(edge.strength * 100).toFixed(0)}%</span>
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
                      placeholder={t.metis.reasonPlaceholder}
                      className="hud-input w-full text-[10px] px-2 py-1" />
                    <div className="flex gap-1">
                      <button onClick={() => handleReview(edge.id, 'confirm')}
                        className="flex-1 text-[10px] px-2 py-1 rounded"
                        style={{ backgroundColor: '#4ade8025',
                          color: '#4ade80' }}>
                        {t.metis.confirm}
                      </button>
                      <button onClick={() => handleReview(edge.id, 'reject')}
                        className="flex-1 text-[10px] px-2 py-1 rounded"
                        style={{ backgroundColor: '#ef444425',
                          color: '#ef4444' }}>
                        {t.metis.reject}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setReviewing(edge.id)}
                    className="mt-2 text-[10px] px-2 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-hover-bg)',
                      color: 'var(--color-text-secondary)' }}>
                    {t.metis.confirm} / {t.metis.reject}
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
