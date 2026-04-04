// journalMetisAdapter — Konvertiert JournalMetisGraph → MetisGraph
// Wird von JournalMetisContent verwendet für Komponenten-Wiederverwendung

import type { MetisGraph } from '../../types/metis'
import type { JournalMetisGraph } from '../../types/metis'

// Journal-Nodes haben String-IDs (j-1, p-2) — Adapter mapped zu numerisch
export function adaptGraph(
  jGraph: JournalMetisGraph, showPublic: boolean,
): MetisGraph {
  const nodes = showPublic
    ? jGraph.nodes
    : jGraph.nodes.filter(n => n.realm === 'journal')
  const nodeIds = new Set(nodes.map(n => n.id))
  const edges = jGraph.edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target)
  )
  const idMap = new Map<string, number>()
  nodes.forEach((n, i) => idMap.set(n.id, i + 1))

  // Cluster filtern + mappen (nur Cluster mit sichtbaren Nodes)
  const clusters = (jGraph.clusters || [])
    .filter(c => showPublic || c.realm === 'journal')
    .map((c, i) => {
      const mappedIds = (c.node_ids || [])
        .filter(nid => idMap.has(nid))
        .map(nid => idMap.get(nid)!)
      return {
        id: i + 1,
        label: c.label || `Cluster ${i + 1}`,
        description: null,
        color: c.color || null,
        node_ids: mappedIds,
      }
    })
    .filter(c => c.node_ids.length > 0)

  return {
    nodes: nodes.map(n => ({
      id: idMap.get(n.id) || 0,
      type: n.realm === 'journal' ? 'entry' as any : n.type as any,
      source_id: n.source_id,
      title: n.label,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      embedding_stale: false,
      cluster_ids: [],
    })),
    edges: edges.map(e => ({
      id: idMap.get(e.id) || 0,
      source_node_id: idMap.get(e.source) || 0,
      target_node_id: idMap.get(e.target) || 0,
      relation_type: 'related' as const,
      strength: e.strength,
    })),
    clusters,
  }
}
