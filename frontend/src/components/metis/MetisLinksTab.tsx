// MetisLinksTab — Review aller Similarity-Edges aus der Metis-Sphäre
// Filter nach Typ, Stärke, Status. Confirm/Reject einzeln.
// Wird in OntologyPage als Tab eingebunden.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, put } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { MetisGraph, MetisNode } from '../../types/metis'

type SortMode = 'weakest' | 'strongest' | 'newest'

export default function MetisLinksTab() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const [graph, setGraph] = useState<MetisGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('suggested')
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

  // Nur Similarity-Edges (positive IDs, keine WikiLinks)
  const metisEdges = useMemo(() => {
    if (!graph) return []
    return graph.edges.filter(e =>
      e.id > 0 && e.relation_type !== 'wikilink'
    )
  }, [graph])

  // Gefiltert + sortiert
  const filtered = useMemo(() => {
    let edges = metisEdges
    if (filterStatus !== 'all') {
      edges = edges.filter(e => e.status === filterStatus)
    }
    if (filterType !== 'all') {
      edges = edges.filter(e => {
        const src = graph?.nodes.find(n => n.id === e.source_node_id)
        const tgt = graph?.nodes.find(n => n.id === e.target_node_id)
        return src?.type === filterType || tgt?.type === filterType
      })
    }
    // Sortierung
    if (sort === 'weakest') edges = [...edges].sort((a, b) => a.strength - b.strength)
    else if (sort === 'strongest') edges = [...edges].sort((a, b) => b.strength - a.strength)
    return edges
  }, [metisEdges, filterStatus, filterType, sort, graph])

  // Node-Titel finden
  const nodeTitle = (nodeId: number): MetisNode | undefined =>
    graph?.nodes.find(n => n.id === nodeId)

  // Navigation
  const navigateTo = (node: MetisNode) => {
    if (node.type === 'note') navigate(`/notes?open=${node.source_id}`)
    else if (node.type === 'summary' && node.module_id) navigate(`/modules/${node.module_id}`)
    else navigate('/dashboard')
  }

  // Confirm/Reject
  const handleReview = async (edgeId: number, action: 'confirm' | 'reject') => {
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

  // Statistik
  const stats = useMemo(() => ({
    total: metisEdges.length,
    suggested: metisEdges.filter(e => e.status === 'suggested').length,
    confirmed: metisEdges.filter(e => e.status === 'confirmed').length,
  }), [metisEdges])

  if (loading) return (
    <p style={{ color: 'var(--color-text-muted)' }}>
      {language === 'de' ? 'Laden...' : 'Loading...'}
    </p>
  )

  return (
    <div>
      {/* Statistik */}
      <div className="flex gap-4 text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        <span>{stats.total} {language === 'de' ? 'Verbindungen' : 'links'}</span>
        <span style={{ color: 'var(--color-warning)' }}>
          {stats.suggested} {language === 'de' ? 'offen' : 'pending'}
        </span>
        <span style={{ color: '#4ade80' }}>
          {stats.confirmed} {language === 'de' ? 'bestätigt' : 'confirmed'}
        </span>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="hud-input text-xs">
          <option value="all">{language === 'de' ? 'Alle Status' : 'All status'}</option>
          <option value="suggested">{language === 'de' ? 'Offen' : 'Pending'}</option>
          <option value="confirmed">{language === 'de' ? 'Bestätigt' : 'Confirmed'}</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="hud-input text-xs">
          <option value="all">{language === 'de' ? 'Alle Typen' : 'All types'}</option>
          <option value="note">Notes</option>
          <option value="summary">Summaries</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as SortMode)}
          className="hud-input text-xs">
          <option value="weakest">{language === 'de' ? 'Schwächste zuerst' : 'Weakest first'}</option>
          <option value="strongest">{language === 'de' ? 'Stärkste zuerst' : 'Strongest first'}</option>
        </select>
      </div>

      {/* Edge-Liste */}
      {filtered.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine Metis-Verbindungen mit diesem Filter.'
              : 'No Metis links matching this filter.'}
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
                {/* Source ↔ Target */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => navigateTo(src)}>
                    {src.title}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>↔</span>
                  <span className="cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => navigateTo(tgt)}>
                    {tgt.title}
                  </span>
                </div>
                {/* Meta */}
                <div className="flex items-center gap-3 mt-1 text-[10px]"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <span>{edge.relation_type}</span>
                  <span>{(edge.strength * 100).toFixed(0)}%</span>
                  <span style={{
                    color: edge.status === 'confirmed' ? '#4ade80' : 'var(--color-warning)',
                  }}>
                    {t.metis[edge.status as 'confirmed' | 'suggested'] || edge.status}
                  </span>
                  {edge.reason && (
                    <span className="truncate max-w-48">— {edge.reason}</span>
                  )}
                </div>
                {/* Confirm/Reject */}
                {edge.status === 'suggested' && (
                  <div className="mt-2">
                    {reviewing === edge.id ? (
                      <div className="space-y-1">
                        <input type="text" value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder={t.metis.reasonPlaceholder}
                          className="hud-input w-full text-[10px] px-2 py-1" />
                        <div className="flex gap-1">
                          <button onClick={() => handleReview(edge.id, 'confirm')}
                            className="flex-1 text-[10px] px-2 py-1 rounded"
                            style={{ backgroundColor: '#4ade8025', color: '#4ade80' }}>
                            {t.metis.confirm}
                          </button>
                          <button onClick={() => handleReview(edge.id, 'reject')}
                            className="flex-1 text-[10px] px-2 py-1 rounded"
                            style={{ backgroundColor: '#ef444425', color: '#ef4444' }}>
                            {t.metis.reject}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setReviewing(edge.id)}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text-secondary)' }}>
                        {t.metis.confirm} / {t.metis.reject}
                      </button>
                    )}
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
