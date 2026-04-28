// MetisSphereSemanticLayout — Cluster-basiertes Layout
//
// Strategie:
//   1. Cluster-Positionen kommen vom Backend (PCA auf Centroide)
//   2. 50 Force-Iterationen auf Cluster-Ebene (Repulsion + Sphere-Constraint)
//      — verhindert Cluster-Overlap, behaelt PCA-Topologie
//   3. Concepts werden lokal um ihren Cluster-Centroid verteilt
//   4. Hybrid-Mode: Cluster-Positionen werden zu Folder-Centroids gezogen
//
// Performance: nur 2372 Nodes in Force-Sim, 3839 Concepts deterministisch.
// Cache-friendly: bei reinem Folder-Anker-Wechsel wird PCA nicht neu gerechnet.

import {
  forceSimulation, forceManyBody, forceLink, forceRadial,
  forceX, forceY, forceZ,
  type SimulationNode,
} from 'd3-force-3d'
import type { MetisGraph } from '../../types/metis'

const SIM_ITERATIONS = 200
const HUB_REPULSION_BASE = -60      // Basis-Repulsion zwischen Clustern
const HUB_REPULSION_MASS = -8       // Multiplikator pro Connectivity-Einheit
const SHELL_STRENGTH = 0.03         // dezenter Sphere-Constraint
const FOLDER_ANCHOR_STRENGTH = 0.04 // Hybrid: Folder-Centroid sehr leicht
const LINK_DISTANCE = 12            // Ziel-Distanz fuer verbundene Cluster
const LINK_STRENGTH_MAX = 0.6       // Max Pull-Faktor pro Edge

interface LayoutResult {
  nodePositions: Map<number, [number, number, number]>
  hubPositions: Map<string, [number, number, number]>
  folderPositions: Map<number, [number, number, number]>
  maxRadius: number
}

export interface ClusterEdgeInput {
  a: number
  b: number
  weight: number
}

export interface SphereLayoutInput {
  positions: Record<string, [number, number, number]>
  folders: Record<string, number | null>
  shellRadius: number
  edges: ClusterEdgeInput[]
  connectivity: Record<string, number>
}

interface ClusterSimNode extends SimulationNode {
  clusterId: number
  folderAnchor: [number, number, number] | null
  connectivity: number
  index?: number  // d3 setzt das selber
}

interface SimLinkInternal {
  source: number  // Index in simNodes
  target: number
  weight: number
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

// Folder-Centroide berechnen (Mean der Cluster-Positionen pro Folder)
function computeFolderCentroids(
  clusterPositions: Map<number, [number, number, number]>,
  clusterFolders: Map<number, number | null>,
): Map<number, [number, number, number]> {
  const sums = new Map<number, [number, number, number, number]>() // [sx, sy, sz, count]
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
  mode: 'semantic' | 'hybrid',
  input: SphereLayoutInput,
): LayoutResult {
  const { positions: pcaPositions, folders: clusterFolderRaw, shellRadius } = input

  // Map-konvertieren fuer schnelleren Zugriff
  const clusterFolders = new Map<number, number | null>()
  Object.entries(clusterFolderRaw).forEach(([k, v]) => clusterFolders.set(Number(k), v))

  // SimNodes: nur Cluster (nicht Concepts!)
  const folderCentroids0 = (() => {
    const initial = new Map<number, [number, number, number]>()
    Object.entries(pcaPositions).forEach(([k, p]) => initial.set(Number(k), p))
    return computeFolderCentroids(initial, clusterFolders)
  })()

  const simNodes: ClusterSimNode[] = []
  const clusterIdToIndex = new Map<number, number>()
  for (const cl of graph.clusters || []) {
    const pcaPos = pcaPositions[String(cl.id)]
    if (!pcaPos) continue
    const fid = clusterFolders.get(cl.id) ?? null
    const folderAnchor = fid !== null ? folderCentroids0.get(fid) ?? null : null
    const conn = input.connectivity[String(cl.id)] ?? 0
    clusterIdToIndex.set(cl.id, simNodes.length)
    simNodes.push({
      clusterId: cl.id,
      folderAnchor,
      connectivity: conn,
      x: pcaPos[0], y: pcaPos[1], z: pcaPos[2],
    })
  }

  // Cluster-Edges -> SimLinks (auf Indizes mappen)
  const simLinks: SimLinkInternal[] = []
  let maxWeight = 0
  for (const e of input.edges) {
    const si = clusterIdToIndex.get(e.a)
    const ti = clusterIdToIndex.get(e.b)
    if (si === undefined || ti === undefined) continue
    if (e.weight > maxWeight) maxWeight = e.weight
    simLinks.push({ source: si, target: ti, weight: e.weight })
  }

  // --- Force-Sim auf Cluster-Ebene mit Familienbildung ---
  // Repulsion-Mass: Cluster mit hoher Connectivity stossen weniger ab
  // (sie sind "schwer" und werden von ihren Nachbarn naeher gehalten)
  const sim = forceSimulation<ClusterSimNode>(simNodes, 3)
    .force('charge', forceManyBody()
      .strength((d: any) => {
        const c = (d as ClusterSimNode).connectivity
        // Mehr Connectivity = weniger Repulsion (Familie zieht zusammen)
        return HUB_REPULSION_BASE - HUB_REPULSION_MASS * Math.log(1 + c / 10)
      })
      .distanceMax(shellRadius * 1.5)
    )
    .force('link', forceLink<SimLinkInternal>(simLinks)
      .id((_d: any, i?: number) => i ?? 0)
      .distance(LINK_DISTANCE)
      .strength((l: any) => {
        const w = (l as SimLinkInternal).weight
        // Normiert auf [0, LINK_STRENGTH_MAX] via tanh-Saturation
        // Vermeidet dass eine Mega-Edge alles zerreisst
        return LINK_STRENGTH_MAX * Math.tanh(w / Math.max(maxWeight * 0.1, 1))
      })
    )
    .force('radial', forceRadial(shellRadius * 0.85, 0, 0, 0).strength(SHELL_STRENGTH))
    .alphaDecay(0.04)
    .velocityDecay(0.4)

  if (mode === 'hybrid') {
    sim.force('folderX', forceX((d: any) => (d as ClusterSimNode).folderAnchor?.[0] ?? 0).strength(
      (d: any) => (d as ClusterSimNode).folderAnchor ? FOLDER_ANCHOR_STRENGTH : 0,
    ))
    sim.force('folderY', forceY((d: any) => (d as ClusterSimNode).folderAnchor?.[1] ?? 0).strength(
      (d: any) => (d as ClusterSimNode).folderAnchor ? FOLDER_ANCHOR_STRENGTH : 0,
    ))
    sim.force('folderZ', forceZ((d: any) => (d as ClusterSimNode).folderAnchor?.[2] ?? 0).strength(
      (d: any) => (d as ClusterSimNode).folderAnchor ? FOLDER_ANCHOR_STRENGTH : 0,
    ))
  }

  sim.stop()
  sim.tick(SIM_ITERATIONS)

  // --- Cluster-Positionen extrahieren ---
  const clusterPositions = new Map<number, [number, number, number]>()
  for (const sn of simNodes) {
    clusterPositions.set(sn.clusterId, [sn.x ?? 0, sn.y ?? 0, sn.z ?? 0])
  }

  // --- Concepts: lokal um ihren Cluster-Centroid verteilen ---
  // Concept -> Cluster-Mapping
  const conceptCluster = new Map<number, number>()
  for (const cl of graph.clusters || []) {
    for (const nid of cl.node_ids || []) {
      if (!conceptCluster.has(nid)) conceptCluster.set(nid, cl.id)
    }
  }

  const nodePositions = new Map<number, [number, number, number]>()
  // Pro Cluster Fibonacci-Wolke
  const clustersById = new Map<number, typeof graph.clusters[0]>()
  for (const cl of graph.clusters || []) clustersById.set(cl.id, cl)

  clustersById.forEach((cl, cid) => {
    const center = clusterPositions.get(cid)
    if (!center) return
    const memberIds = cl.node_ids || []
    const memberCount = memberIds.length
    // Lokaler Radius: sqrt-Skalierung damit grosse Cluster nicht implodieren
    const localRadius = Math.max(1.5, Math.sqrt(memberCount) * 1.0)
    const offsets = fibPoints(memberCount, localRadius)
    memberIds.forEach((nid, i) => {
      const off = offsets[i] || [0, 0, 0]
      nodePositions.set(nid, [center[0] + off[0], center[1] + off[1], center[2] + off[2]])
    })
  })

  // Cluster-lose Concepts: zufaellig auf der Shell
  let orphanIdx = 0
  for (const node of graph.nodes) {
    if (nodePositions.has(node.id)) continue
    const orphanRadius = shellRadius * 1.05 // leicht ausserhalb damit sichtbar
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

  // Folder-Hubs: Centroid der finalen Cluster-Positionen
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
