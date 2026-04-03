// Metis TypeScript Types — Knowledge-Graph Datenstrukturen
// Werden von MetisPage und allen Metis-Komponenten verwendet.

// Ein Node im Knowledge-Graph (Note oder Summary)
export interface MetisNode {
  id: number
  type: 'note' | 'summary'
  source_id: number
  title: string
  pos_x: number | null
  pos_y: number | null
  embedding_stale: boolean
  cluster_ids: number[]
}

// Eine Kante zwischen zwei Nodes
export interface MetisEdge {
  id: number
  source_node_id: number
  target_node_id: number
  relation_type: 'wikilink' | 'related' | 'builds_on' | 'contradicts'
  strength: number
}

// Ein Themen-Cluster (AI-generiert)
export interface MetisCluster {
  id: number
  label: string
  description: string | null
  color: string | null
  node_ids: number[]
}

// Kompletter Graph vom Backend
export interface MetisGraph {
  nodes: MetisNode[]
  edges: MetisEdge[]
  clusters: MetisCluster[]
}

// Ansichts-Modi
export type MetisViewMode = '2d' | '3d' | 'list'
