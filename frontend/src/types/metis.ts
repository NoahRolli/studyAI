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
  source_count?: number
  folder_id?: number | null
  folder_name?: string | null
}

// Eine Kante zwischen zwei Nodes
export interface MetisEdge {
  id: number
  source_node_id: number
  target_node_id: number
  relation_type: { id: number; name: string; label_de: string; label_en: string } | string | null
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
  folders?: { id: number; name: string }[]
}

// Ansichts-Modi
export type MetisViewMode = '3d' | 'list' | 'concepts' | 'graph' | 'links'


// --- Konzept-Graph ---

export interface ConceptNode {
  id: number
  name: string
  description: string | null
  source_count: number
  folder_id: number | null
  folder_name: string | null
  created_at: string | null
}

export interface ConceptEdge {
  id: number
  source: number
  target: number
  relation_type: { id: number; name: string; label_de: string; label_en: string } | string | null
  strength: number
  origin: string
  status: "suggested" | "confirmed" | "rejected"
  reason?: string | null
}









export interface ConceptSource {
  type: string                  // 'note' | 'summary' | 'chat_message' | 'entry'
  id: number
  title: string
  relevance: number
  // Optional je nach Typ (vom Backend angereichert):
  module_id?: number | null     // bei summary
  document_id?: number | null   // bei chat_message ODER bei summary (Dokument-ID)
  turn_index?: number           // bei chat_message
  preview?: string              // bei chat_message
  role?: string                 // bei chat_message
}

export interface ChatSource {
  message_id: number
  document_id: number
  turn_index: number
  role: string
  text_preview: string
  conversation_title: string
  created_at: string | null
  relevance: number
}

export interface ChatSourcesResponse {
  concept_id: number
  count: number
  sources: ChatSource[]
}

export interface ConceptDetail extends ConceptNode {
  sources: ConceptSource[]
  related: { id: number; name: string; relation: string; direction: string }[]
}

export interface ConceptGraph {
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  clusters: { id: number; label: string; description: string | null; node_ids: number[] }[]
  folders?: { id: number; name: string }[]
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
  folder_id?: number | null
  folder_name?: string | null
}

// Edge im merged Graph
export interface JournalMetisEdge {
  id: string
  source: string       // Node-ID ("j-5", "p-3")
  target: string
  relation_type: { id: number; name: string; label_de: string; label_en: string } | string | null
  strength: number
  status: 'suggested' | 'confirmed' | 'rejected'
  reason?: string | null
  realm: 'journal' | 'public'
  folder_id?: number | null
  folder_name?: string | null
}

// Cluster im merged Graph
export interface JournalMetisCluster {
  id: string
  label: string
  color: string
  node_ids: string[]
  realm: 'journal' | 'public'
  folder_id?: number | null
  folder_name?: string | null
}

// Kompletter merged Graph
export interface JournalMetisGraph {
  nodes: JournalMetisNode[]
  edges: JournalMetisEdge[]
  clusters: JournalMetisCluster[]
}
