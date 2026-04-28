// MetisSphereSemanticLayout — Cluster-basiertes Layout mit pre-computed Positions
//
// Backend macht die Force-Sim einmal (CLI-Script compute_sphere_layout.py),
// schreibt Final-Positionen in DB. Frontend bekommt die fertig serviert
// und plaziert nur noch Concepts lokal um ihren Cluster-Centroid.
//
// Vorteil: kein Frame-Freeze, instant load, deterministisch ueber Sessions.

import type { MetisGraph } from '../../types/metis'

interface LayoutResult {
  nodePositions: Map<number, [number, number, number]>
  hubPositions: Map<string, [number, number, number]>
  folderPositions: Map<number, [number, number, number]>
  maxRadius: number
}

export interface SphereLayoutInput {
  positions: Record<string, [number, number, number]>
  folders: Record<string, number | null>
  shellRadius: number
  connectivity: Record<string, number>
}

// Determinstisch um Centroid verteilen (Fibonacci-Sphaere)
function fibPoints(count: number, radius: number): [number, number, number][] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const result: [number, number, number][] = []
  for (let i = 0; i < count; i++) {
    const y = count > 1 ? 1 - (i / (count - 1)) * 2 : 0
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    result.push([Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius])
  }
  return result
}

// Folder-Centroide aus Cluster-Positionen berechnen
function computeFolderCentroids(
  clusterPositions: Map<number, [number, number, number]>,
  clusterFolders: Map<number, number | null>,
): Map<number, [number, number, number]> {
  const sums = new Map<number, [number, number, number, number]>()
  clusterPositions.forEach((pos, cid) => {
    const fid = clusterFolders.get(cid)
    if (fid === null || fid === undefined) return
    const cur = sums.get(fid) ?? [0, 0, 0, 0]
    sums.set(fid, [cur[0] + pos[0], cur[1] + pos[1], cur[2] + pos[2], cur[3] + 1])
  })
  const result = new Map<number, [number, number, number]>()
  sums.forEach(([sx, sy, sz, n], fid) => {
    if (n > 0) result.set(fid, [sx / n, sy / n, sz / n])
  })
  return result
}

export function computeSemanticLayout(
  graph: MetisGraph,
  _mode: 'semantic' | 'hybrid',
  input: SphereLayoutInput,
): LayoutResult {
  const { positions: clusterPosRaw, folders: clusterFolderRaw, shellRadius } = input

  // Map-konvertieren fuer schnelleren Zugriff
  const clusterPositions = new Map<number, [number, number, number]>()
  Object.entries(clusterPosRaw).forEach(([k, p]) => clusterPositions.set(Number(k), p))
  const clusterFolders = new Map<number, number | null>()
  Object.entries(clusterFolderRaw).forEach(([k, v]) => clusterFolders.set(Number(k), v))

  // --- Concepts: lokal um ihren Cluster-Centroid verteilen ---
  // Concept -> Cluster-Mapping (1:1, erstes Cluster)
  const conceptCluster = new Map<number, number>()
  for (const cl of graph.clusters || []) {
    for (const nid of cl.node_ids || []) {
      if (!conceptCluster.has(nid)) conceptCluster.set(nid, cl.id)
    }
  }

  // Pro Cluster Fibonacci-Wolke
  const nodePositions = new Map<number, [number, number, number]>()
  for (const cl of graph.clusters || []) {
    const center = clusterPositions.get(cl.id)
    if (!center) continue
    const memberIds = cl.node_ids || []
    const memberCount = memberIds.length
    // Lokaler Radius: sqrt-Skalierung damit grosse Cluster nicht implodieren
    const localRadius = Math.max(1.5, Math.sqrt(memberCount) * 1.0)
    const offsets = fibPoints(memberCount, localRadius)
    memberIds.forEach((nid, i) => {
      const off = offsets[i] || [0, 0, 0]
      nodePositions.set(nid, [center[0] + off[0], center[1] + off[1], center[2] + off[2]])
    })
  }

  // Cluster-lose Concepts: deterministisch auf Outer-Shell
  let orphanIdx = 0
  for (const node of graph.nodes) {
    if (nodePositions.has(node.id)) continue
    const orphanRadius = shellRadius * 1.05
    const u = (orphanIdx * 0.618) % 1; orphanIdx++
    const v = ((orphanIdx * 0.382) + 0.5) % 1
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    nodePositions.set(node.id, [
      orphanRadius * Math.sin(phi) * Math.cos(theta),
      orphanRadius * Math.sin(phi) * Math.sin(theta),
      orphanRadius * Math.cos(phi),
    ])
  }

  // Hub-Positionen = Cluster-Positionen mit "hub-{id}" Key
  const hubPositions = new Map<string, [number, number, number]>()
  clusterPositions.forEach((p, cid) => hubPositions.set(`hub-${cid}`, p))

  // Folder-Hubs: Centroid der Cluster-Positionen pro Folder
  const folderPositions = computeFolderCentroids(clusterPositions, clusterFolders)

  // MaxRadius
  let maxR = 0
  const measure = (m: Map<any, [number, number, number]>) => {
    m.forEach(p => {
      const d = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2])
      if (d > maxR) maxR = d
    })
  }
  measure(nodePositions); measure(hubPositions); measure(folderPositions)

  return { nodePositions, hubPositions, folderPositions, maxRadius: maxR }
}
