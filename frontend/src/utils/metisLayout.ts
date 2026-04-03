// Metis Layout — dagre-basiertes Auto-Layout für den 2D-Graph
// Gepinnte Nodes (pos_x/pos_y gesetzt) behalten ihre Position.
// Nicht-gepinnte Nodes werden automatisch arrangiert.

import type { MetisGraph, MetisNode } from '../types/metis'

// Layout-Node mit berechneten Koordinaten
export interface LayoutNode extends MetisNode {
  x: number
  y: number
}

// Einfaches Force-directed Layout ohne externe Dependency
// dagre wird später ergänzt wenn npm install möglich ist
export function layoutGraph(graph: MetisGraph): { nodes: LayoutNode[] } {
  const NODE_W = 160
  const PADDING = 40

  // Adjacency Map für Verbindungsinfo
  const connections = new Map<number, number[]>()
  for (const node of graph.nodes) {
    connections.set(node.id, [])
  }
  for (const edge of graph.edges) {
    connections.get(edge.source_node_id)?.push(edge.target_node_id)
    connections.get(edge.target_node_id)?.push(edge.source_node_id)
  }

  // Nodes nach Verbindungsanzahl sortieren (meiste zuerst → Mitte)
  const sorted = [...graph.nodes].sort((a, b) => {
    const ca = connections.get(a.id)?.length || 0
    const cb = connections.get(b.id)?.length || 0
    return cb - ca
  })

  // Grid-Layout als Fallback — Spirale von der Mitte nach aussen
  const positioned: LayoutNode[] = []

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i]

    // Gepinnte Nodes behalten ihre Position
    if (node.pos_x !== null && node.pos_y !== null) {
      positioned.push({ ...node, x: node.pos_x, y: node.pos_y })
      continue
    }

    // Spiral-Layout: Ringe um die Mitte
    const angle = i * 2.4 // Goldener Winkel in Radiant
    const radius = Math.sqrt(i) * (NODE_W + PADDING)
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius

    positioned.push({ ...node, x, y })
  }

  return { nodes: positioned }
}
