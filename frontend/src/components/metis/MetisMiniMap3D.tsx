// MetisMiniMap3D — Radar-Übersicht für die 3D Sphäre
// Zeigt alle Nodes als kleine Dots in einer 2D-Projektion.
// Passt zum HUD-Design mit dunklem Hintergrund und Glow.

import { useMemo } from 'react'
import type { MetisGraph } from '../../types/metis'

// Farben pro Typ
const COLORS = {
  note: '#7dd4a3',
  summary: '#d4a574',
}

interface Props {
  graph: MetisGraph
}

export default function MetisMiniMap3D({ graph }: Props) {
  // Node-Positionen berechnen (Fibonacci-Projektion auf 2D)
  const dots = useMemo(() => {
    const n = graph.nodes.length
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))

    return graph.nodes.map((node, i) => {
      const y = 1 - (i / (n - 1 || 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = goldenAngle * i

      // Auf MiniMap-Koordinaten projizieren (0-100)
      const x = 50 + Math.cos(theta) * r * 40
      const yPos = 50 + y * 40

      const conns = graph.edges.filter(
        e => e.source_node_id === node.id || e.target_node_id === node.id,
      ).length

      return {
        id: node.id,
        x,
        y: yPos,
        color: COLORS[node.type] || COLORS.note,
        size: 3 + conns * 1,
      }
    })
  }, [graph])

  // Edges projizieren
  const lines = useMemo(() => {
    return graph.edges.map(edge => {
      const from = dots.find(d => d.id === edge.source_node_id)
      const to = dots.find(d => d.id === edge.target_node_id)
      if (!from || !to) return null
      return { id: edge.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
    }).filter(Boolean)
  }, [graph, dots])

  return (
    <div
      className="absolute bottom-3 right-3 z-10"
      style={{
        width: 140,
        height: 140,
        backgroundColor: 'var(--color-bg-deep)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflow: 'hidden',
        opacity: 0.85,
      }}
    >
      <svg width="140" height="140" viewBox="0 0 100 100">
        {/* Edges */}
        {lines.map(line => line && (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="var(--color-border)"
            strokeWidth="0.5"
            opacity="0.4"
          />
        ))}

        {/* Nodes */}
        {dots.map(dot => (
          <circle
            key={dot.id}
            cx={dot.x}
            cy={dot.y}
            r={Math.min(dot.size, 5)}
            fill={dot.color}
            opacity="0.8"
          >
            {/* Glow-Filter */}
            <animate
              attributeName="opacity"
              values="0.6;1;0.6"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  )
}
