// MetisSphereLayout — Hierarchische Positionierung fuer Metis-Sphäre
// Ordner = aeussere Gravitationszentren auf der Sphäre
// Cluster = mittlere Schicht, gruppiert um ihren Ordner
// Konzepte = innere Schicht, um ihren Cluster positioniert
// Ordnerlose/Clusterlose Konzepte in separater Zone

import type { MetisGraph } from '../../types/metis'

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

interface LayoutResult {
  nodePositions: Map<number, [number, number, number]>
  hubPositions: Map<string, [number, number, number]>
  folderPositions: Map<number, [number, number, number]>
}

// Punkt auf Fibonacci-Sphäre berechnen
function fibPoint(index: number, total: number, radius: number): [number, number, number] {
  const y = total > 1 ? 1 - (index / (total - 1)) * 2 : 0
  const r = Math.sqrt(1 - y * y)
  const theta = GOLDEN * index
  return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]
}

// Punkt im Kugelvolumen um ein Zentrum verteilen
function spreadPoint(
  index: number, total: number, center: [number, number, number], spread: number,
): [number, number, number] {
  const y = total > 1 ? 1 - (index / (total - 1)) * 2 : 0
  const r = Math.sqrt(1 - y * y)
  const theta = GOLDEN * index
  return [
    center[0] + Math.cos(theta) * r * spread,
    center[1] + y * spread,
    center[2] + Math.sin(theta) * r * spread,
  ]
}

export function computeHierarchicalLayout(graph: MetisGraph): LayoutResult {
  const nodePositions = new Map<number, [number, number, number]>()
  const hubPositions = new Map<string, [number, number, number]>()
  const folderPositions = new Map<number, [number, number, number]>()

  const n = graph.nodes.length
  const folders = graph.folders || []
  const clusters = graph.clusters || []
  const radius = 6 + Math.sqrt(n) * 0.7

  // --- Schritt 1: Ordner auf der Sphäre verteilen ---
  const folderCount = folders.length
  folders.forEach((f, i) => {
    // Ordner bekommen die aeusserste Schicht
    const pos = fibPoint(i, Math.max(folderCount, 2), radius * 0.55)
    folderPositions.set(f.id, pos)
  })

  // --- Schritt 2: Cluster ihren Ordnern zuordnen ---
  // Finde den dominanten Ordner pro Cluster (Mehrheit der Members)
  const clusterFolderMap = new Map<number, number | null>()
  for (const cl of clusters) {
    const folderCounts = new Map<number, number>()
    for (const nid of cl.node_ids) {
      const node = graph.nodes.find(nd => nd.id === nid)
      if (node?.folder_id) {
        folderCounts.set(node.folder_id, (folderCounts.get(node.folder_id) || 0) + 1)
      }
    }
    // Dominanter Ordner = meiste Members
    let bestFid: number | null = null
    let bestCount = 0
    folderCounts.forEach((count, fid) => {
      if (count > bestCount) { bestFid = fid; bestCount = count }
    })
    clusterFolderMap.set(cl.id, bestFid)
  }

  // Cluster nach Ordner gruppieren
  const folderClusters = new Map<number, typeof clusters>()
  const orphanClusters: typeof clusters = []
  for (const cl of clusters) {
    const fid = clusterFolderMap.get(cl.id)
    if (fid && folderPositions.has(fid)) {
      if (!folderClusters.has(fid)) folderClusters.set(fid, [])
      folderClusters.get(fid)!.push(cl)
    } else {
      orphanClusters.push(cl)
    }
  }

  // --- Schritt 3: Cluster-Hubs positionieren ---
  // Cluster mit Ordner: Ring um Ordner-Position
  folderClusters.forEach((cls, fid) => {
    const fPos = folderPositions.get(fid)!
    const clSpread = 2.5 + Math.sqrt(cls.length) * 0.8
    cls.forEach((cl, i) => {
      const pos = spreadPoint(i, cls.length, fPos, clSpread)
      hubPositions.set(`hub-${cl.id}`, pos)
    })
  })

  // Orphan-Cluster: eigene Zone (gegenueber der Ordner)
  orphanClusters.forEach((cl, i) => {
    const pos = fibPoint(i + folderCount, Math.max(orphanClusters.length + folderCount, 2), radius * 0.5)
    hubPositions.set(`hub-${cl.id}`, pos)
  })

  // --- Schritt 4: Nodes positionieren ---
  // Zuordnung: Node -> Cluster
  const nodeClusterMap = new Map<number, number>()
  for (const cl of clusters) {
    for (const nid of cl.node_ids) {
      if (!nodeClusterMap.has(nid)) nodeClusterMap.set(nid, cl.id)
    }
  }

  // Nodes mit Cluster: um ihren Hub
  const clusterNodeIndices = new Map<number, number>()
  const clusterNodeCounts = new Map<number, number>()
  for (const cl of clusters) {
    clusterNodeCounts.set(cl.id, cl.node_ids.length)
  }

  for (const node of graph.nodes) {
    const clId = nodeClusterMap.get(node.id)
    if (clId !== undefined) {
      const hubPos = hubPositions.get(`hub-${clId}`)
      if (hubPos) {
        const idx = clusterNodeIndices.get(clId) || 0
        clusterNodeIndices.set(clId, idx + 1)
        const count = clusterNodeCounts.get(clId) || 1
        const spread = 1.8 + Math.sqrt(count) * 0.4
        nodePositions.set(node.id, spreadPoint(idx, count, hubPos, spread))
        continue
      }
    }

    // Node ohne Cluster aber mit Ordner: um Ordner-Position
    if (node.folder_id && folderPositions.has(node.folder_id)) {
      const fPos = folderPositions.get(node.folder_id)!
      // Zaehle lose Nodes pro Ordner fuer Verteilung
      const looseIdx = nodePositions.size // grob, reicht fuer Spread
      nodePositions.set(node.id, spreadPoint(looseIdx, n, fPos, 3.0))
      continue
    }

    // Komplett lose Nodes: auf der Sphäre verteilen
    const looseIdx = nodePositions.size
    nodePositions.set(node.id, fibPoint(looseIdx, n, radius))
  }

  return { nodePositions, hubPositions, folderPositions }
}
