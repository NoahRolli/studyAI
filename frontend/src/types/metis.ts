// Metis TypeScript Types — Knowledge-Graph Datenstrukturen
// Werden von MetisPage und allen Metis-Komponenten verwendet.

// Ein Node im Knowledge-Graph (Note, Summary oder Entry)
export interface MetisNode {
  id: number
  type: 'note' | 'summary' | 'entry'
  source_id: number
  module_id?: number | null
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
  relation_type: string
  strength: number
  status: 'suggested' | 'confirmed' | 'rejected'
  reason?: string | null
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
export type MetisViewMode = '3d' | 'list' | 'concepts'


// --- Konzept-Graph ---

export interface ConceptNode {
  id: number
  name: string
  description: string | null
  source_count: number
  created_at: string | null
}

export interface ConceptEdge {
  id: number
  source: number
  target: number
  relation_type: string
  strength: number
  ai_generated: boolean
  confirmed: boolean | null
}

export interface ConceptSource {
  type: string
  id: number
  title: string
  relevance: number
}

export interface ConceptDetail extends ConceptNode {
  sources: ConceptSource[]
  related: { id: number; name: string; relation: string; direction: string }[]
}

export interface ConceptGraph {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
}
// --- Journal Metis (verschlüsselt, merged view) ---

// Node im merged Journal-Metis-Graph
export interface JournalMetisNode {
  id: string           // "j-5" (journal) oder "p-3" (public)
  type: string         // "entry", "note", "summary"
  source_id: number
  module_id?: number | null
  label: string
  pos_x: number | null
  pos_y: number | null
  cluster_ids: string[]
  realm: 'journal' | 'public'
}

// Edge im merged Graph
export interface JournalMetisEdge {
  id: string
  source: string       // Node-ID ("j-5", "p-3")
  target: string
  relation_type: string
  strength: number
  status: 'suggested' | 'confirmed' | 'rejected'
  reason?: string | null
  realm: 'journal' | 'public'
}

// Cluster im merged Graph
export interface JournalMetisCluster {
  id: string
  label: string
  color: string
  node_ids: string[]
  realm: 'journal' | 'public'
}

// Kompletter merged Graph
export interface JournalMetisGraph {
  nodes: JournalMetisNode[]
  edges: JournalMetisEdge[]
  clusters: JournalMetisCluster[]
}
