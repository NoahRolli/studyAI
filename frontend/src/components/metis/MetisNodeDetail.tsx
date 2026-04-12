// MetisNodeDetail — Detail-Panel bei Klick auf einen Node
// Zeigt Titel, Typ, Cluster, Verbindungen mit Confirm/Reject.
// Klick auf Connection-Titel → Navigation zur Quelle.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'
import { put } from '../../hooks/useAPI'
import type { MetisGraph, MetisNode, MetisEdge } from '../../types/metis'

interface Props {
  node: MetisNode
  graph: MetisGraph
  onClose: () => void
  onEdgeReviewed?: () => void
}

// Farben pro Node-Typ
const TYPE_COLORS: Record<string, string> = {
  note: '#7dd4a3',
  summary: '#d4a574',
  entry: '#00d4ff',
}

// Status-Farben
const STATUS_COLORS: Record<string, string> = {
  suggested: 'var(--color-text-muted)',
  confirmed: '#4ade80',
  rejected: '#ef4444',
}

export default function MetisNodeDetail({
  node, graph, onClose, onEdgeReviewed,
}: Props) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // Verbundene Nodes + Edge-Daten finden
  const connections = useMemo(() => {
    const result: { node: MetisNode; edge: MetisEdge }[] = []
    for (const edge of graph.edges) {
      let targetId: number | null = null
      if (edge.source_node_id === node.id) targetId = edge.target_node_id
      if (edge.target_node_id === node.id) targetId = edge.source_node_id
      if (targetId) {
        const target = graph.nodes.find(n => n.id === targetId)
        if (target) result.push({ node: target, edge })
      }
    }
    // Confirmed zuerst, dann suggested
    return result.sort((a, b) => {
      if (a.edge.status === 'confirmed' && b.edge.status !== 'confirmed') return -1
      if (b.edge.status === 'confirmed' && a.edge.status !== 'confirmed') return 1
      return b.edge.strength - a.edge.strength
    })
  }, [node, graph])

  // Cluster finden
  const clusters = useMemo(() => {
    return graph.clusters.filter(c => c.node_ids.includes(node.id))
  }, [node, graph])

  // Navigation zur Quelle eines Nodes
  const navigateTo = (n: MetisNode) => {
    if (n.type === 'note') navigate(`/notes?open=${n.source_id}`)
    else if (n.type === 'entry') navigate(`/journal?entry=${n.source_id}`)
    else if (n.type === 'summary' && n.module_id) navigate(`/modules/${n.module_id}`)
    else navigate('/archiv')
    onClose()
  }

  // Edge bestätigen oder ablehnen
  const handleReview = async (edgeId: number, action: 'confirm' | 'reject') => {
    // Ontology-Edges (negative IDs) nicht reviewbar
    if (edgeId < 0) return
    setLoading(true)
    try {
      await put(`/api/relations/${edgeId}/${action}`, {
        reason: reason || null,
      })
      setReviewingId(null)
      setReason('')
      onEdgeReviewed?.()
    } catch (e) {
      console.error('Edge review failed:', e)
    }
    setLoading(false)
  }

  // Typ-Label
  const typeLabel = node.type === 'note'
    ? t.metis.nodeNote
    : node.type === 'entry'
      ? t.metis.nodeEntry || 'Entry'
      : t.metis.nodeSummary

  // Ist Edge eine Ontology-Relation? (negative ID)
  const isOntology = (edge: MetisEdge) => edge.id < 0

  return (
    <div
      className="absolute top-4 right-4 w-80 hud-card p-4 z-50 animate-fade-in"
      style={{
        borderColor: TYPE_COLORS[node.type] || 'var(--color-border)',
        boxShadow: `0 0 12px ${TYPE_COLORS[node.type]}30`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: TYPE_COLORS[node.type] }}
        >
          {typeLabel}
        </span>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm"
        >
          x
        </button>
      </div>

      {/* Titel */}
      <h3
        className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 cursor-pointer hover:underline"
        onClick={() => navigateTo(node)}
      >
        {node.title}
      </h3>

      {/* Cluster */}
      {clusters.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-[var(--color-text-muted)] mb-1">
            {t.metis.clusters}
          </div>
          <div className="flex flex-wrap gap-1">
            {clusters.map(c => (
              <span
                key={c.id}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `${c.color}20`,
                  color: c.color || 'var(--color-text-secondary)',
                  border: `1px solid ${c.color}40`,
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verbindungen mit Confirm/Reject */}
      {connections.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-[var(--color-text-muted)] mb-1">
            {t.metis.edges} ({connections.length})
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {connections.map(({ node: conn, edge }) => (
              <div
                key={edge.id}
                className="rounded px-2 py-1.5"
                style={{ backgroundColor: 'var(--color-hover-bg)' }}
              >
                {/* Titel + Typ */}
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[conn.type] }}
                  />
                  <span
                    className="truncate cursor-pointer hover:underline text-[var(--color-text-secondary)]"
                    onClick={() => navigateTo(conn)}
                  >
                    {conn.title}
                  </span>
                </div>
                {/* Meta-Zeile: Typ + Stärke + Status */}
                <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--color-text-muted)]">
                  <span>{typeof edge.relation_type === "object" && edge.relation_type ? edge.relation_type.name : (edge.relation_type || "")}</span>
                  {!isOntology(edge) && (
                    <span>{(edge.strength * 100).toFixed(0)}%</span>
                  )}
                  <span
                    className="ml-auto"
                    style={{ color: STATUS_COLORS[edge.status] }}
                  >
                    {t.metis[edge.status as 'confirmed' | 'suggested'] || edge.status}
                  </span>
                </div>
                {/* Confirm/Reject Buttons (nur für suggested, nicht Ontology) */}
                {edge.status === 'suggested' && !isOntology(edge) && (
                  <div className="mt-1.5">
                    {reviewingId === edge.id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder={t.metis.reasonPlaceholder}
                          className="hud-input w-full text-[10px] px-2 py-1"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleReview(edge.id, 'confirm')}
                            disabled={loading}
                            className="flex-1 text-[10px] px-2 py-0.5 rounded"
                            style={{ backgroundColor: '#4ade8025', color: '#4ade80' }}
                          >
                            {t.metis.confirm}
                          </button>
                          <button
                            onClick={() => handleReview(edge.id, 'reject')}
                            disabled={loading}
                            className="flex-1 text-[10px] px-2 py-0.5 rounded"
                            style={{ backgroundColor: '#ef444425', color: '#ef4444' }}
                          >
                            {t.metis.reject}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setReviewingId(edge.id)}
                          className="flex-1 text-[10px] px-2 py-0.5 rounded"
                          style={{ backgroundColor: '#4ade8015', color: '#4ade80' }}
                        >
                          {t.metis.confirm} / {t.metis.reject}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quelle öffnen */}
      <button
        onClick={() => navigateTo(node)}
        className="hud-btn w-full text-xs mt-1"
      >
        {t.metis.openSource}
      </button>
    </div>
  )
}
