// MetisNode2D — Custom ReactFlow Node für den Knowledge-Graph
// Zeigt Titel, Typ-Farbe als Rand, Glow-Effekt.
// Grösse proportional zur Anzahl Verbindungen.

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

interface MetisNodeData {
  label: string
  nodeType: 'note' | 'summary'
  color: string
  pinned: boolean
  connectionCount: number
}

function MetisNode2D({ data }: NodeProps<MetisNodeData>) {
  // Basisgrösse + Bonus pro Verbindung (max 2x)
  const scale = Math.min(1 + data.connectionCount * 0.1, 2)
  const size = 120 * scale

  return (
    <div
      style={{
        width: size,
        minHeight: 40,
        borderColor: data.color,
        boxShadow: `0 0 ${8 * scale}px ${data.color}40`,
      }}
      className="
        rounded-lg border-2 px-3 py-2
        bg-[var(--color-bg-surface)]
        text-[var(--color-text-primary)]
        cursor-pointer transition-all duration-200
        hover:brightness-125
      "
    >
      {/* Typ-Indikator */}
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: data.color }}
      >
        {data.nodeType === 'note' ? 'N' : 'S'}
        {data.pinned ? ' *' : ''}
      </div>

      {/* Titel */}
      <div className="text-xs font-medium leading-tight truncate">
        {data.label}
      </div>

      {/* ReactFlow Handles — unsichtbar, für Edges */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, width: 1, height: 1 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, width: 1, height: 1 }}
      />
    </div>
  )
}

export default memo(MetisNode2D)
