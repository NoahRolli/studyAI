// ClusterDetail — Detail-Panel bei Klick auf Cluster-Hub oder Folder-Hub
// Zeigt Cluster/Folder-Name, Member-Anzahl, und alle Member-Nodes
// Klick auf Member → onNodeSelect (oeffnet Concept-Detail-Panel)

import { useMemo } from 'react'
import type { MetisGraph, MetisNode } from '../../types/metis'

interface Props {
  clusterId?: number
  folderId?: number
  graph: MetisGraph
  onClose: () => void
  onNodeSelect: (nodeId: number) => void
}

// Farben pro Node-Typ
const TYPE_COLORS: Record<string, string> = {
  note: '#7dd4a3',
  summary: '#d4a574',
  entry: '#00d4ff',
}

export default function ClusterDetail({
  clusterId, folderId, graph, onClose, onNodeSelect,
}: Props) {

  // Titel und Members bestimmen
  const { title, color, members } = useMemo(() => {
    if (clusterId !== undefined) {
      const cluster = graph.clusters.find(c => c.id === clusterId)
      if (!cluster) return { title: '?', color: 'var(--color-primary)', members: [] }
      const nodes = cluster.node_ids
        .map(nid => graph.nodes.find(n => n.id === nid))
        .filter(Boolean) as MetisNode[]
      return {
        title: cluster.label,
        color: cluster.color || 'var(--color-primary)',
        members: nodes,
      }
    }
    if (folderId !== undefined) {
      const folder = (graph.folders || []).find(f => f.id === folderId)
      const nodes = graph.nodes.filter(n => n.folder_id === folderId)
      return {
        title: folder?.name || 'Folder',
        color: 'var(--color-primary)',
        members: nodes,
      }
    }
    return { title: '?', color: 'var(--color-primary)', members: [] }
  }, [clusterId, folderId, graph])

  return (
    <div
      className="absolute top-4 right-4 w-80 hud-card p-4 z-50 animate-fade-in"
      style={{
        borderColor: color,
        boxShadow: `0 0 12px ${color}30`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color }}
        >
          {clusterId !== undefined ? 'Cluster' : 'Folder'}
        </span>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm"
        >
          x
        </button>
      </div>

      {/* Titel */}
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
        {title}
      </h3>
      <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
        {members.length} {members.length === 1 ? 'Node' : 'Nodes'}
      </p>

      {/* Member-Liste */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {members.map(node => (
          <div
            key={node.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer
              transition-all duration-200 hover:bg-[rgba(0,212,255,0.08)]"
            style={{ backgroundColor: 'var(--color-hover-bg)' }}
            onClick={() => onNodeSelect(node.id)}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: TYPE_COLORS[node.type] || '#888' }}
            />
            <span className="text-[11px] truncate text-[var(--color-text-secondary)]">
              {node.title}
            </span>
          </div>
        ))}
      </div>

      {/* Alle anzeigen Button */}
</div>
  )
}
