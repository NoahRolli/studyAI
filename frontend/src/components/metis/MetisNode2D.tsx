// MetisNode2D — Kreisförmiger Node im Knowledge-Graph
// Leuchtender Dot mit Label daneben. Grösse proportional zu Verbindungen.
// Farbe: Grün=Note, Orange=Summary. Sanfter Glow-Effekt.

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
  // Dot-Grösse: 12px Basis + 4px pro Verbindung (max 36px)
  const dotSize = Math.min(12 + data.connectionCount * 4, 36)
  // Glow-Intensität steigt mit Verbindungen
  const glowSize = Math.min(8 + data.connectionCount * 3, 24)

  return (
    <div className="flex items-center gap-2 group cursor-pointer">
      {/* Leuchtender Dot */}
      <div
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: data.color,
          boxShadow: `0 0 ${glowSize}px ${data.color}80, 0 0 ${glowSize * 2}px ${data.color}30`,
          borderRadius: '50%',
          border: data.pinned
            ? `2px solid ${data.color}`
            : '1px solid rgba(255,255,255,0.15)',
          transition: 'all 0.3s ease',
        }}
        className="group-hover:brightness-150 group-hover:scale-125"
      />

      {/* Label — erscheint neben dem Dot */}
      <div
        className="
          text-[11px] leading-tight max-w-[120px] truncate
          text-[var(--color-text-secondary)]
          group-hover:text-[var(--color-text-primary)]
          transition-colors duration-200
        "
        style={{
          textShadow: `0 0 6px ${data.color}40`,
        }}
      >
        {data.label}
      </div>

      {/* Typ-Indikator — klein über dem Label */}
      <div
        className="
          absolute -top-3 left-0 text-[8px] uppercase tracking-widest
          opacity-0 group-hover:opacity-100 transition-opacity
        "
        style={{ color: data.color }}
      >
        {data.nodeType === 'note' ? 'NOTE' : 'SUM'}
      </div>

      {/* ReactFlow Handles — unsichtbar */}
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
