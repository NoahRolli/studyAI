// journalMetisAdapter — Konvertiert JournalMetisGraph → MetisGraph
// Cluster werden als pseudo-Folders fuer Journal-Nodes verwendet
// Public Nodes behalten ihre echten folder_id/folder_name
// Ergebnis: MetisSphereLayout kann hierarchisch positionieren

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

  // Journal-Cluster als pseudo-Folders (negative IDs)
  const jClusters = (jGraph.clusters || []).filter(c => c.realm === 'journal')
  const clusterFolderMap = new Map<string, number>()
  const pseudoFolders: { id: number; name: string }[] = []
  jClusters.forEach((c, i) => {
    // Nur Cluster mit sichtbaren Nodes als pseudo-Folder
    const hasVisible = (c.node_ids || []).some(nid => nodeIds.has(nid))
    if (!hasVisible) return
    const pseudoId = -(i + 1)
    clusterFolderMap.set(c.id, pseudoId)
    pseudoFolders.push({ id: pseudoId, name: c.label || `Cluster ${i + 1}` })
  })

  // Node-ID → pseudo-Folder-ID Mapping (Journal-Nodes via Cluster)
  const nodeClusterFolder = new Map<string, number>()
  for (const c of jClusters) {
    const pseudoId = clusterFolderMap.get(c.id)
    if (pseudoId === undefined) continue
    for (const nid of c.node_ids || []) {
      if (!nodeClusterFolder.has(nid)) {
        nodeClusterFolder.set(nid, pseudoId)
      }
    }
  }

  // Echte Folders aus Backend-Response (fuer Public Nodes)
  const backendFolders: { id: number; name: string }[] =
    (jGraph as any).folders || []

  // Cluster filtern + mappen
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

  // Nodes mit folder_id mappen
  const mappedNodes = nodes.map(n => {
    let folderId: number | null = null
    let folderName: string | null = null

    if (n.realm === 'journal') {
      const pf = nodeClusterFolder.get(n.id)
      if (pf !== undefined) {
        folderId = pf
        folderName = pseudoFolders.find(f => f.id === pf)?.name || null
      }
    } else {
      folderId = (n as any).folder_id || null
      folderName = (n as any).folder_name || null
    }

    return {
      id: idMap.get(n.id) || 0,
      type: n.realm === 'journal' ? 'entry' as any : n.type as any,
      source_id: n.source_id,
      title: n.label,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      embedding_stale: false,
      cluster_ids: [],
      folder_id: folderId,
      folder_name: folderName,
    }
  })

  // Nur Folders behalten die tatsaechlich Nodes haben
  const usedFolderIds = new Set(
    mappedNodes.map(n => n.folder_id).filter(Boolean) as number[]
  )
  const activeFolders = showPublic
    ? [...backendFolders.filter(f => usedFolderIds.has(f.id)), ...pseudoFolders]
    : pseudoFolders.filter(f => usedFolderIds.has(f.id))

  return {
    nodes: mappedNodes,
    edges: edges.map(e => ({
      id: idMap.get(e.id) || 0,
      source_node_id: idMap.get(e.source) || 0,
      target_node_id: idMap.get(e.target) || 0,
      relation_type: e.relation_type || 'related',
      strength: e.strength,
      status: e.status || 'suggested',
    })),
    clusters,
    folders: activeFolders,
  }
}
