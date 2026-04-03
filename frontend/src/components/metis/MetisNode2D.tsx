// MetisNode2D — Leuchtender Dot-Node für den 2D Knowledge-Graph
// Grün=Note, Orange=Summary. CSS-Glow, Hover-Effekt.
// Grösse proportional zu Verbindungen.

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
  const dotSize = Math.min(14 + data.connectionCount * 5, 40)
  const glowSize = Math.min(10 + data.connectionCount * 4, 28)

  return (
    <div className="flex items-center gap-2.5 group cursor-pointer relative">
      {/* Äusserer Glow — pulsierend per CSS */}
      <div
        className="absolute rounded-full animate-pulse"
        style={{
          width: dotSize * 2.5,
          height: dotSize * 2.5,
          left: -(dotSize * 2.5 - dotSize) / 2,
          top: -(dotSize * 2.5 - dotSize) / 2,
          backgroundColor: data.color,
          opacity: 0.06,
          filter: `blur(${glowSize}px)`,
          transition: 'all 0.4s ease',
        }}
      />

      {/* Leuchtender Dot */}
      <div
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: '#ffffff',
          boxShadow: `
            0 0 ${glowSize * 0.5}px ${data.color}cc,
            0 0 ${glowSize}px ${data.color}80,
            0 0 ${glowSize * 2}px ${data.color}40,
            inset 0 0 ${dotSize * 0.3}px ${data.color}60
          `,
          borderRadius: '50%',
          border: `2px solid ${data.color}90`,
          transition: 'all 0.3s ease',
          position: 'relative',
          zIndex: 1,
        }}
        className="group-hover:scale-130"
      />

      {/* Label */}
      <div
        className="
          text-[11px] leading-tight max-w-[130px] truncate
          text-[var(--color-text-secondary)]
          group-hover:text-[var(--color-text-primary)]
          transition-colors duration-200
        "
        style={{
          textShadow: `0 0 8px ${data.color}50`,
          fontFamily: 'var(--font-body)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {data.label}
      </div>

      {/* Typ + Pin Indikator bei Hover */}
      <div
        className="
          absolute -top-4 left-0 text-[8px] uppercase tracking-widest
          opacity-0 group-hover:opacity-100 transition-opacity duration-200
        "
        style={{ color: data.color, zIndex: 2 }}
      >
        {data.nodeType === 'note' ? 'NOTE' : 'SUM'}
        {data.pinned ? ' *' : ''}
      </div>

      {/* Handles */}
      <Handle type="target" position={Position.Top}
        style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  )
}

export default memo(MetisNode2D)
