// MetisNodeDetail — Detail-Panel bei Klick auf einen Node
// Zeigt Titel, Typ, Cluster, Verbindungen.
// "Quelle öffnen" navigiert direkt zur Note/Entry/Summary.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'
import type { MetisGraph, MetisNode } from '../../types/metis'

interface Props {
  node: MetisNode
  graph: MetisGraph
  onClose: () => void
}

// Farben pro Typ
const TYPE_COLORS: Record<string, string> = {
  note: '#7dd4a3',
  summary: '#d4a574',
  entry: '#00d4ff',
}

export default function MetisNodeDetail({ node, graph, onClose }: Props) {
  const { t } = useLanguage()
  const navigate = useNavigate()

  // Verbundene Nodes finden
  const connections = useMemo(() => {
    const connected: { node: MetisNode; type: string }[] = []
    for (const edge of graph.edges) {
      let targetId: number | null = null
      if (edge.source_node_id === node.id) targetId = edge.target_node_id
      if (edge.target_node_id === node.id) targetId = edge.source_node_id
      if (targetId) {
        const target = graph.nodes.find(n => n.id === targetId)
        if (target) {
          connected.push({ node: target, type: edge.relation_type })
        }
      }
    }
    return connected
  }, [node, graph])

  // Cluster finden
  const clusters = useMemo(() => {
    return graph.clusters.filter(c => c.node_ids.includes(node.id))
  }, [node, graph])

  // Direkte Navigation zur Quelle
  const handleOpenSource = () => {
    const sid = node.source_id
    if (node.type === 'note') {
      navigate(`/notes?open=${sid}`)
    } else if (node.type === 'entry') {
      navigate(`/journal?entry=${sid}`)
    } else if (node.type === 'summary' && node.module_id) {
      navigate(`/modules/${node.module_id}`)
    } else {
      navigate('/dashboard')
    }
    onClose()
  }

  // Typ-Label
  const typeLabel = node.type === 'note'
    ? t.metis.nodeNote
    : node.type === 'entry'
      ? t.metis.nodeEntry || 'Entry'
      : t.metis.nodeSummary

  return (
    <div
      className="
        absolute top-4 right-4 w-72 hud-card p-4 z-50
        animate-fade-in
      "
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
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
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

      {/* Verbindungen */}
      {connections.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase text-[var(--color-text-muted)] mb-1">
            {t.metis.edges} ({connections.length})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {connections.map((conn, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[conn.node.type] }}
                />
                <span className="truncate">{conn.node.title}</span>
                <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                  {conn.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quelle öffnen */}
      <button
        onClick={handleOpenSource}
        className="hud-btn w-full text-xs mt-1"
      >
        {t.metis.openSource}
      </button>
    </div>
  )
}
