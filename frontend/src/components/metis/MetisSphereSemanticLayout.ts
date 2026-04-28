// MetisSphereSemanticLayout — Force-Directed Layout via d3-force-3d
// Konzepte werden NICHT hierarchisch nach Folder gruppiert, sondern
// nach semantischer Aehnlichkeit (Edges) positioniert.
// Folder-Hubs landen am Centroid ihrer Member, Cluster-Hubs ebenso.
//
// Modi:
//   - 'semantic': nur Edge-Forces, Folder als Farbe sichtbar (kein Anker)
//   - 'hybrid':   Folder als schwacher Centroid-Anker + Edge-Forces
//
// Skalierung:
//   - Aktuell ~3800 sichtbare Nodes, ~26k Edges
//   - Edge-Filter strength >= 0.85 reduziert Sim-Last drastisch
//   - 200 Iterationen one-shot, kein Frame-Loop
//   - Octree-Repulsion via d3 (forceManyBody mit theta=0.9)

import {
  forceSimulation, forceLink, forceManyBody,
  forceRadial, forceX, forceY, forceZ,
  type SimulationNode,
} from 'd3-force-3d'
import type { MetisGraph } from '../../types/metis'

const SIM_EDGE_MIN_STRENGTH = 0.85   // nur starke Edges ziehen
const SIM_ITERATIONS = 200
const SHELL_RADIUS_FACTOR = 1.0      // Multiplier auf Auto-Radius

interface LayoutResult {
  nodePositions: Map<number, [number, number, number]>
  hubPositions: Map<string, [number, number, number]>
  folderPositions: Map<number, [number, number, number]>
  maxRadius: number
}

interface SimNode extends SimulationNode {
  id: number
  folderId: number | null
  folderAnchor: [number, number, number] | null
}

interface SimLink {
  source: number
  target: number
  strength: number
}

// Initiale Positionen: zufaellig auf Sphaere — gibt der Sim Startenergie
function randomShellPosition(radius: number): [number, number, number] {
  const u = Math.random(), v = Math.random()
  const theta = 2 * Math.PI * u
  const phi = Math.acos(2 * v - 1)
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  ]
}

// Folder-Anker auf Fibonacci-Sphaere — gleichmaessige Verteilung
function fibPoint(i: number, n: number, r: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0
  const rad = Math.sqrt(1 - y * y)
  const theta = golden * i
  return [Math.cos(theta) * rad * r, y * r, Math.sin(theta) * rad * r]
}

export function computeSemanticLayout(
  graph: MetisGraph,
  mode: 'semantic' | 'hybrid' = 'semantic',
): LayoutResult {
  const n = graph.nodes.length
  const radius = (8 + Math.sqrt(n) * 1.2) * SHELL_RADIUS_FACTOR

  // Folder-Anker positionieren (auch im 'semantic' Mode fuer Hub-Positionen)
  const folders = graph.folders || []
  const folderAnchors = new Map<number, [number, number, number]>()
  folders.forEach((f, i) => {
    folderAnchors.set(f.id, fibPoint(i, Math.max(folders.length, 2), radius * 0.7))
  })

  // SimNodes vorbereiten
  const simNodes: SimNode[] = graph.nodes.map(node => {
    const start = randomShellPosition(radius)
    const anchor = node.folder_id ? folderAnchors.get(node.folder_id) || null : null
    return {
      id: node.id,
      folderId: node.folder_id ?? null,
      folderAnchor: anchor,
      x: start[0], y: start[1], z: start[2],
    }
  })

  // SimLinks: nur starke Edges, Quelle/Ziel via Index
  const idToIndex = new Map<number, number>()
  simNodes.forEach((sn, i) => idToIndex.set(sn.id, i))
  const simLinks: SimLink[] = []
  for (const e of graph.edges) {
    if ((e.strength ?? 0) < SIM_EDGE_MIN_STRENGTH) continue
    const si = idToIndex.get(e.source_node_id)
    const ti = idToIndex.get(e.target_node_id)
    if (si === undefined || ti === undefined) continue
    simLinks.push({ source: si, target: ti, strength: e.strength ?? 0.85 })
  }

  // --- Forces ---
  // Repulsion: alle Nodes stossen sich ab
  const manyBody = forceManyBody()
    .strength(-15)
    .distanceMax(radius * 0.8)
    .theta(0.9)

  // Links: starke Edges ziehen
  const link = forceLink<SimLink>(simLinks)
    .distance(8)
    .strength(l => Math.min(1.0, ((l as SimLink).strength - 0.5) * 1.5))

  // Sphere-Constraint: Nodes Richtung Shell ziehen
  const radial = forceRadial(radius * 0.85, 0, 0, 0)
    .strength(0.3)

  const sim = forceSimulation<SimNode>(simNodes, 3)
    .force('charge', manyBody)
    .force('link', link)
    .force('radial', radial)
    .alphaDecay(0.05)
    .velocityDecay(0.4)

  // Hybrid-Modus: zusaetzlich Folder-Anker (schwach)
  if (mode === 'hybrid') {
    sim.force('folderX', forceX((d: any) => (d as SimNode).folderAnchor?.[0] ?? 0).strength(
      (d: any) => (d as SimNode).folderAnchor ? 0.08 : 0,
    ))
    sim.force('folderY', forceY((d: any) => (d as SimNode).folderAnchor?.[1] ?? 0).strength(
      (d: any) => (d as SimNode).folderAnchor ? 0.08 : 0,
    ))
    sim.force('folderZ', forceZ((d: any) => (d as SimNode).folderAnchor?.[2] ?? 0).strength(
      (d: any) => (d as SimNode).folderAnchor ? 0.08 : 0,
    ))
  }

  // One-Shot: alle Iterationen in einem Block
  sim.stop()
  sim.tick(SIM_ITERATIONS)

  // --- Ergebnis: Positionen extrahieren ---
  const nodePositions = new Map<number, [number, number, number]>()
  for (const sn of simNodes) {
    nodePositions.set(sn.id, [sn.x ?? 0, sn.y ?? 0, sn.z ?? 0])
  }

  // Cluster-Hubs: Centroid der Member-Nodes
  const hubPositions = new Map<string, [number, number, number]>()
  for (const cl of graph.clusters || []) {
    let cx = 0, cy = 0, cz = 0, cnt = 0
    for (const nid of cl.node_ids || []) {
      const pos = nodePositions.get(nid)
      if (!pos) continue
      cx += pos[0]; cy += pos[1]; cz += pos[2]; cnt++
    }
    if (cnt > 0) {
      hubPositions.set(`hub-${cl.id}`, [cx / cnt, cy / cnt, cz / cnt])
    }
  }

  // Folder-Hubs: Centroid der Folder-Nodes (im semantic mode wandern sie mit)
  const folderPositions = new Map<number, [number, number, number]>()
  for (const f of folders) {
    let cx = 0, cy = 0, cz = 0, cnt = 0
    for (const node of graph.nodes) {
      if (node.folder_id !== f.id) continue
      const pos = nodePositions.get(node.id)
      if (!pos) continue
      cx += pos[0]; cy += pos[1]; cz += pos[2]; cnt++
    }
    if (cnt > 0) {
      folderPositions.set(f.id, [cx / cnt, cy / cnt, cz / cnt])
    }
  }

  // MaxRadius fuer Kamera-Auto-Fit
  let maxR = 0
  const measure = (m: Map<any, [number, number, number]>) => {
    m.forEach(p => {
      const d = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2)
      if (d > maxR) maxR = d
    })
  }
  measure(nodePositions); measure(hubPositions); measure(folderPositions)

  return { nodePositions, hubPositions, folderPositions, maxRadius: maxR }
}
