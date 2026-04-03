// MetisMiniMap3D — Radar-Übersicht für die 3D Sphäre
// Zeigt Nodes als Dots + Viewport-Indikator der Kamera-Position.
// Viewport bewegt sich mit wenn man zoomt/rotiert.

import { useMemo } from 'react'
import type { MetisGraph } from '../../types/metis'

// Farben pro Typ
const COLORS = {
  note: '#7dd4a3',
  summary: '#d4a574',
}

interface Props {
  graph: MetisGraph
  cameraAzimuth: number   // Horizontaler Winkel (0–360)
  cameraElevation: number // Vertikaler Winkel (-90–90)
  cameraDistance: number   // Zoom-Distanz
}

export default function MetisMiniMap3D({
  graph, cameraAzimuth, cameraElevation, cameraDistance,
}: Props) {
  // Node-Positionen (Fibonacci auf 2D)
  const dots = useMemo(() => {
    const n = graph.nodes.length
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))

    return graph.nodes.map((node, i) => {
      const y = 1 - (i / (n - 1 || 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = goldenAngle * i
      const x = 50 + Math.cos(theta) * r * 38
      const yPos = 50 + y * 38
      const conns = graph.edges.filter(
        e => e.source_node_id === node.id || e.target_node_id === node.id,
      ).length
      return {
        id: node.id, x, y: yPos,
        color: COLORS[node.type] || COLORS.note,
        size: 3 + conns * 1,
      }
    })
  }, [graph])

  // Edges
  const lines = useMemo(() => {
    return graph.edges.map(edge => {
      const from = dots.find(d => d.id === edge.source_node_id)
      const to = dots.find(d => d.id === edge.target_node_id)
      if (!from || !to) return null
      return { id: edge.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
    }).filter(Boolean)
  }, [graph, dots])

  // Viewport-Indikator Position (basierend auf Kamera-Winkel)
  const azimuthRad = (cameraAzimuth * Math.PI) / 180
  const elevRad = (cameraElevation * Math.PI) / 180
  // Kamera schaut von aussen auf die Sphäre — Indikator zeigt wohin
  const vpX = 50 + Math.sin(azimuthRad) * Math.cos(elevRad) * 35
  const vpY = 50 - Math.sin(elevRad) * 35
  // Viewport-Grösse umgekehrt proportional zum Zoom
  const vpSize = Math.max(8, Math.min(30, (cameraDistance / 30) * 28))

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
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke="var(--color-border)"
            strokeWidth="0.5"
            opacity="0.4"
          />
        ))}

        {/* Nodes */}
        {dots.map(dot => (
          <circle
            key={dot.id}
            cx={dot.x} cy={dot.y}
            r={Math.min(dot.size, 5)}
            fill={dot.color}
            opacity="0.8"
          />
        ))}

        {/* Viewport-Indikator — zeigt Kamera-Blickrichtung */}
        <rect
          x={vpX - vpSize / 2}
          y={vpY - vpSize / 2}
          width={vpSize}
          height={vpSize}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1"
          opacity="0.7"
          rx="2"
        />
        {/* Kamera-Punkt */}
        <circle
          cx={vpX}
          cy={vpY}
          r="2"
          fill="var(--color-primary)"
          opacity="0.9"
        />
      </svg>
    </div>
  )
}
