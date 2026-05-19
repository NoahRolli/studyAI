// MetisSphere3D — 3D Sphäre mit Folder-Hubs, Cluster-Nebel, Konzept-Nodes
// Hierarchische Positionierung: Ordner -> Cluster -> Konzepte
// Quaternion-basierte Trackball-Rotation (kein Gimbal Lock)
//
// Phase 2.1: Edges via Custom RGBA-Shader (1 Draw-Call)
// Optik soll funktional identisch zu GlowEdge bleiben — nur konsolidiert
// Glow + Pixel-Breite kommen in Phase 2.2

import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { MetisGraph } from '../../types/metis'
import {
  BackgroundGrid, CameraTracker,
} from './MetisSphereNodes'
import InstancedNodes from './InstancedNodes'
import InstancedEdges, { type InstancedEdge } from './InstancedEdges'
import InstancedClusterHubs, { type ClusterHubData } from './InstancedClusterHubs'
import MetisSphereSettings from './MetisSphereSettings'
import { useSphereSettings } from '../../hooks/useSphereSettings'
import { computeHierarchicalLayout } from './MetisSphereLayout'
import { computeSemanticLayout, type SphereLayoutInput } from './MetisSphereSemanticLayout'
import { useSphereLayout } from '../../hooks/useSphereLayout'

const COLORS: Record<string, THREE.Color> = {
  note: new THREE.Color('#90edb8'),
  summary: new THREE.Color('#e8b882'),
  wikilink: new THREE.Color('#e8e090'),
  ai: new THREE.Color('#6aacbe'),
  entry: new THREE.Color('#00d4ff'),
  is_a: new THREE.Color('#ff6b9d'),
  subclass_of: new THREE.Color('#c084fc'),
  part_of: new THREE.Color('#fb923c'),
  builds_on: new THREE.Color('#4ade80'),
  requires: new THREE.Color('#f87171'),
  contradicts: new THREE.Color('#ef4444'),
  example_of: new THREE.Color('#67e8f9'),
  related_to: new THREE.Color('#a78bfa'),
}
const HUB_FALLBACK = [
  "#7dd4a3", "#d4a574", "#d4cc7d", "#7dd8e8", "#e88a8a",
  "#c084fc", "#fb923c", "#67e8f9", "#a78bfa", "#f472b6",
  "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#818cf8",
  "#2dd4bf", "#e879f9", "#a3e635", "#f59e0b", "#ec4899",
  "#14b8a6", "#8b5cf6", "#84cc16", "#ef4444", "#06b6d4",
]
const EDGE_DEFAULT = new THREE.Color('#c0eaf5')
const FOLDER_COLORS = ['#00d4ff', '#ff6b9d', '#4ade80', '#fb923c', '#c084fc', '#67e8f9']
const CLICK_THRESHOLD = 5
const WHITE = new THREE.Color('#ffffff')

// Edge-Alpha-Werte: bewusst klein gehalten weil viele Edges sich ueberlappen
// Bei 12k Edges + 1800 Nodes ist die Sphaere visuell dicht — wir wollen Hierarchie
const EDGE_ALPHA_IDLE = 0.15           // Standard: leise leuchtend
const EDGE_ALPHA_HIGHLIGHT = 0.85      // Highlighted: deutlich da
const EDGE_ALPHA_HUB_IDLE = 0.05       // Hub-Strahlen idle: sehr dezent
const EDGE_ALPHA_HUB_HIGHLIGHT = 0.7   // Hub-Strahlen highlighted
const EDGE_ALPHA_FOLDER_IDLE = 0.08    // Folder-Hub-Verbindungen idle
const EDGE_ALPHA_FOLDER_HIGHLIGHT = 0.6

// @ts-expect-error temporaer deaktiviert fuer Klick-Bug-Diagnose
// WebGL Context-Lost Guard
// Browser kann GL-Context unter Memory-Druck oder bei Tab-Wechsel wegwerfen.
// Ohne preventDefault() bleibt der Context endgueltig tot -> Klicks tot, Render
// eingefroren. Mit preventDefault() aktiviert der Browser den Restore-Pfad.
// Bei Restored triggern wir invalidate(), damit R3F neu rendert.
function WebGLContextGuard() {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (e: Event) => {
      e.preventDefault()
      console.warn('[Metis] WebGL Context Lost — Restore-Pfad aktiviert')
    }
    const onRestored = () => {
      console.info('[Metis] WebGL Context Restored — Re-Render triggern')
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl, invalidate])
  return null
}

function TrackballControls({ groupRef, onInteract, isDraggingRef }: {
  groupRef: React.RefObject<THREE.Group | null>
  onInteract: () => void
  isDraggingRef: React.MutableRefObject<boolean>
}) {
  const { gl, camera } = useThree()
  const isDown = useRef(false)
  const startXY = useRef({ x: 0, y: 0 })
  const prevXY = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = gl.domElement
    const applyRotation = (dx: number, dy: number) => {
      if (!groupRef.current) return
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.005)
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.005)
      groupRef.current.quaternion.premultiply(qx).premultiply(qy)
    }
    const checkDrag = (cx: number, cy: number) => {
      const dx = cx - startXY.current.x, dy = cy - startXY.current.y
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) isDraggingRef.current = true
    }
    const onDown = (x: number, y: number) => {
      isDown.current = true; isDraggingRef.current = false
      startXY.current = { x, y }; prevXY.current = { x, y }; onInteract()
    }
    const onMove = (x: number, y: number) => {
      if (!isDown.current) return
      checkDrag(x, y); onInteract()
      applyRotation(x - prevXY.current.x, y - prevXY.current.y)
      prevXY.current = { x, y }
    }
    const onUp = () => { isDown.current = false }
    const pd = (e: PointerEvent) => onDown(e.clientX, e.clientY)
    const pm = (e: PointerEvent) => onMove(e.clientX, e.clientY)
    const ts = (e: TouchEvent) => { if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY) }
    const tm = (e: TouchEvent) => { if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY) }
    const wh = (e: WheelEvent) => {
      e.preventDefault(); onInteract()
      camera.position.z = Math.max(15, Math.min(800, camera.position.z + e.deltaY * 0.03))
    }
    el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm)
    el.addEventListener('pointerup', onUp); el.addEventListener('pointerleave', onUp)
    el.addEventListener('touchstart', ts, { passive: true })
    el.addEventListener('touchmove', tm, { passive: true })
    el.addEventListener('touchend', onUp); el.addEventListener('wheel', wh, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm)
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointerleave', onUp)
      el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm)
      el.removeEventListener('touchend', onUp); el.removeEventListener('wheel', wh)
    }
  }, [gl, camera, groupRef, onInteract, isDraggingRef])
  return null
}

function MetisScene({ graph, onNodeClick, onClusterClick, onFolderClick, onCameraMove, transparent,
  showLabels, isDraggingRef, settings, sphereLayoutInput }: {
  graph: MetisGraph; onNodeClick?: (id: number) => void; onClusterClick?: (id: number) => void; onFolderClick?: (id: number) => void
  onCameraMove: (a: number, e: number, d: number) => void
  transparent?: boolean; showLabels: boolean
  isDraggingRef: React.MutableRefObject<boolean>
  settings: import('../../hooks/useSphereSettings').SphereSettings
  sphereLayoutInput: SphereLayoutInput | null
}) {
  const groupRef = useRef<THREE.Group>(null)
  const idleTime = useRef(0)
  const [clickedId, setClickedId] = useState<number | null>(null)
  const [activeHub, setActiveHub] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<number | null>(null)
  const handleInteract = useCallback(() => { idleTime.current = 0 }, [])

  const nodesById = useMemo(() => {
    const m = new Map<number, MetisGraph['nodes'][0]>()
    for (const n of graph.nodes) m.set(n.id, n)
    return m
  }, [graph.nodes])

  const hubData = useMemo(() => {
    if (!graph.clusters || graph.clusters.length === 0) return []
    const folders = graph.folders || []
    return graph.clusters.map((cluster, i) => {
      const folderCounts = new Map<number, number>()
      for (const nid of (cluster.node_ids || [])) {
        const n = nodesById.get(nid)
        if (n?.folder_id) folderCounts.set(n.folder_id, (folderCounts.get(n.folder_id) || 0) + 1)
      }
      let bestFid: number | null = null, bestCnt = 0
      folderCounts.forEach((cnt, fid) => { if (cnt > bestCnt) { bestFid = fid; bestCnt = cnt } })
      let color: THREE.Color
      if (bestFid !== null) {
        const fIdx = folders.findIndex(f => f.id === bestFid)
        const baseColor = new THREE.Color(FOLDER_COLORS[fIdx >= 0 ? fIdx % FOLDER_COLORS.length : 0])
        const hsl = { h: 0, s: 0, l: 0 }
        baseColor.getHSL(hsl)
        hsl.h = (hsl.h + (i * 0.04) % 0.15) % 1
        hsl.s = Math.max(0.2, Math.min(0.5, hsl.s * 0.5 + (i % 3 - 1) * 0.05))
        hsl.l = Math.max(0.3, Math.min(0.8, hsl.l + (i % 4 - 2) * 0.05))
        color = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
      } else {
        color = new THREE.Color(HUB_FALLBACK[i % HUB_FALLBACK.length])
      }
      return {
        id: `hub-${cluster.id}`, label: cluster.label || `Cluster ${i + 1}`,
        color, memberNodeIds: cluster.node_ids || [],
        memberCount: (cluster.node_ids || []).length,
        dominantFolderId: bestFid,
      }
    }).filter(h => h.memberCount > 0)
  }, [graph.clusters, graph.folders, nodesById])

  const nodeToHubColor = useMemo(() => {
    const m = new Map<number, THREE.Color>()
    for (const hub of hubData) {
      for (const nid of hub.memberNodeIds) m.set(nid, hub.color)
    }
    return m
  }, [hubData])

  const folderData = useMemo(() => {
    const nodesByFolder = new Map<number, number>()
    graph.nodes.forEach(n => {
      if (n.folder_id) nodesByFolder.set(n.folder_id, (nodesByFolder.get(n.folder_id) || 0) + 1)
    })
    return (graph.folders || []).filter(f => nodesByFolder.has(f.id)).map((f, i) => ({
      id: f.id, label: f.name,
      color: new THREE.Color(FOLDER_COLORS[i % FOLDER_COLORS.length]),
    }))
  }, [graph.folders, graph.nodes])

  const folderNodeIds = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const node of graph.nodes) {
      if (node.folder_id) {
        if (!map.has(node.folder_id)) map.set(node.folder_id, new Set())
        map.get(node.folder_id)!.add(node.id)
      }
    }
    return map
  }, [graph.nodes])

  const highlightSet = useMemo(() => {
    if (activeFolder) return folderNodeIds.get(activeFolder) || new Set<number>()
    if (activeHub) {
      const hub = hubData.find(h => h.id === activeHub)
      return new Set(hub?.memberNodeIds || [])
    }
    if (clickedId) return new Set([clickedId])
    return new Set<number>()
  }, [activeFolder, activeHub, clickedId, folderNodeIds, hubData])

  const handleHubClick = useCallback((hubId: string, _memberIds: number[]) => {
    if (isDraggingRef.current) return
    setActiveFolder(null)
    if (activeHub === hubId) { setActiveHub(null); setClickedId(null) }
    else { setActiveHub(hubId); setClickedId(null); const clId = parseInt(hubId.replace("hub-", "")); onClusterClick?.(clId) }
  }, [activeHub, onClusterClick, isDraggingRef])

  const handleFolderClick = useCallback((folderId: number) => {
    if (isDraggingRef.current) return
    setActiveHub(null); setClickedId(null)
    setActiveFolder(prev => { const next = prev === folderId ? null : folderId; if (next !== null) onFolderClick?.(next); return next })
  }, [isDraggingRef, onFolderClick])

  const handleNodeClick = useCallback((nodeId: number) => {
    if (isDraggingRef.current) return
    setClickedId(prev => prev === nodeId ? null : nodeId)
    setActiveHub(null); setActiveFolder(null); onNodeClick?.(nodeId)
  }, [onNodeClick, isDraggingRef])

  const { nodePositions, hubPositions, folderPositions, maxRadius } = useMemo(
    () => {
      if (settings.layoutMode === 'hybrid' && sphereLayoutInput) {
        const result = computeSemanticLayout(graph, 'hybrid', sphereLayoutInput)
        // shellRadius vom Backend ist die echte Sphere-Groesse, robuster als maxRadius
        return { ...result, maxRadius: sphereLayoutInput.shellRadius }
      }
      // Fallback: hierarchisch (auch wenn semantic gewaehlt aber input fehlt)
      return computeHierarchicalLayout(graph)
    },
    [graph, settings.layoutMode, sphereLayoutInput],
  )

  // Unified Hub-Data für InstancedClusterHubs (Folder + Cluster zusammen)
  const unifiedHubs = useMemo<ClusterHubData[]>(() => {
    const result: ClusterHubData[] = []
    for (const fd of folderData) {
      const pos = folderPositions.get(fd.id)
      if (!pos) continue
      result.push({
        id: `folder-${fd.id}`,
        position: pos,
        color: fd.color,
        size: 2.8,
        label: fd.label,
        memberCount: 9999,
        isFolder: true,
      })
    }
    for (const hub of hubData) {
      const pos = hubPositions.get(hub.id)
      if (!pos) continue
      const size = Math.min(0.5 + hub.memberCount * 0.04, 2.2)
      result.push({
        id: hub.id,
        position: pos,
        color: hub.color,
        size,
        label: hub.label,
        memberCount: hub.memberCount,
        isFolder: false,
      })
    }
    return result
  }, [folderData, folderPositions, hubData, hubPositions])

  const activeUnifiedHubId = activeHub
    ? activeHub
    : activeFolder !== null
      ? `folder-${activeFolder}`
      : null

  const handleUnifiedHubClick = useCallback((id: string) => {
    if (id.startsWith('folder-')) {
      const fid = parseInt(id.replace('folder-', ''))
      handleFolderClick(fid)
    } else {
      const hub = hubData.find(h => h.id === id)
      if (hub) handleHubClick(id, hub.memberNodeIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubData])

  const instancedNodeData = useMemo(() => {
    const data: Array<{ id: number; position: [number, number, number]; color: THREE.Color }> = []
    for (const node of graph.nodes) {
      const pos = nodePositions.get(node.id)
      if (!pos) continue
      const hubColor = nodeToHubColor.get(node.id)
      const color = settings.showNodeColors && hubColor ? hubColor : WHITE
      data.push({ id: node.id, position: pos, color })
    }
    return data
  }, [graph.nodes, nodePositions, nodeToHubColor, settings.showNodeColors])

  // === Phase 2.1: Konsolidierte Edge-Liste fuer Custom-Shader ===
  // Drei Edge-Quellen werden in ein einziges Array gepackt
  // Alpha steuert Sichtbarkeit, Color bleibt voll
    const instancedEdgeData = useMemo<InstancedEdge[]>(() => {
    const result: InstancedEdge[] = []
    const hasHighlight = highlightSet.size > 0

    // 1. Node-to-Node Edges (Konzept-Beziehungen)
    for (const edge of graph.edges) {
      const s = nodePositions.get(edge.source_node_id)
      const e = nodePositions.get(edge.target_node_id)
      if (!s || !e) continue
      const hl = hasHighlight
        && (highlightSet.has(edge.source_node_id) || highlightSet.has(edge.target_node_id))
      const rt = typeof edge.relation_type === 'object' && edge.relation_type
        ? edge.relation_type.name : (edge.relation_type || '')
      const isOnt = edge.id < 0
      const color = settings.showEdgeColors
        ? (COLORS[rt] || COLORS.ai)
        : EDGE_DEFAULT
      const alpha = hl
        ? EDGE_ALPHA_HIGHLIGHT
        : isOnt
          ? Math.min(1.0, EDGE_ALPHA_IDLE * settings.edgeOntology * 1.5)
          : Math.min(1.0, EDGE_ALPHA_IDLE * settings.edgeSimilarity)
      result.push({ start: s, end: e, color, alpha })
    }

    // 2. Hub-to-Node Edges (sehr viele, idle dezent halten)
    for (const hub of hubData) {
      const hp = hubPositions.get(hub.id)
      if (!hp) continue
      for (const nid of hub.memberNodeIds) {
        const np = nodePositions.get(nid)
        if (!np) continue
        const hl = activeHub === hub.id || highlightSet.has(nid)
        const color = settings.showEdgeColors ? hub.color : EDGE_DEFAULT
        const alpha = hl ? EDGE_ALPHA_HUB_HIGHLIGHT : EDGE_ALPHA_HUB_IDLE
        result.push({ start: hp, end: np, color, alpha })
      }
    }

    // 3. Folder-to-Hub Edges
    const folderColorMap = new Map<number, THREE.Color>()
    for (const fd of folderData) folderColorMap.set(fd.id, fd.color)
    for (const hub of hubData) {
      if (hub.dominantFolderId === null) continue
      const fPos = folderPositions.get(hub.dominantFolderId)
      const hp = hubPositions.get(hub.id)
      if (!fPos || !hp) continue
      const color = folderColorMap.get(hub.dominantFolderId)
      if (!color) continue
      const hl = activeFolder === hub.dominantFolderId
      const alpha = hl ? EDGE_ALPHA_FOLDER_HIGHLIGHT : EDGE_ALPHA_FOLDER_IDLE
      result.push({
        start: fPos,
        end: hp,
        color: settings.showEdgeColors ? color : EDGE_DEFAULT,
        alpha,
      })
    }

    return result
  }, [graph.edges, nodePositions, hubData, hubPositions, folderData, folderPositions,
      activeHub, activeFolder, highlightSet,
      settings.showEdgeColors, settings.edgeOntology, settings.edgeSimilarity, settings.layoutMode])

  const { camera } = useThree()
  useEffect(() => {
    if (maxRadius > 0) {
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
      // Folder kompakter, Semantic etwas weiter weg
      const factor = settings.layoutMode === 'hybrid' ? 1.1 : 0.9
      const dist = (maxRadius * factor) / Math.sin(fov / 2)
      camera.position.set(0, 0, Math.max(20, Math.min(800, dist)))
    }
  }, [maxRadius, camera, settings.layoutMode])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    idleTime.current += delta
    if (idleTime.current > 2) {
      groupRef.current.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), delta * 0.06),
      )
    }
  })

  return (
    <>
      {/* <WebGLContextGuard /> */}
      <TrackballControls groupRef={groupRef} onInteract={handleInteract} isDraggingRef={isDraggingRef} />
      <ambientLight intensity={0.1} />
      <CameraTracker onCameraMove={onCameraMove} />
      {!transparent && <BackgroundGrid />}
      <group ref={groupRef}>
        {/* === Phase 2.1: Alle Edges in einem Custom-Shader-Draw === */}
        <InstancedEdges edges={instancedEdgeData} />

        <InstancedClusterHubs
          hubs={unifiedHubs}
          activeHubId={activeUnifiedHubId}
          showLabels={showLabels}
          intensityMul={settings.nebulaIntensity}
          sizeMul={settings.nebulaSize}
          colorMul={settings.colorIntensity}
          pulse={settings.clusterPulse}
          onHubClick={handleUnifiedHubClick}
          isDraggingRef={isDraggingRef}
        />
        <InstancedNodes
          nodes={instancedNodeData}
          highlightSet={highlightSet}
          colorIntensity={settings.colorIntensity}
          highlightBoost={settings.colorIntensity * 1.5}
          baseSize={0.12}
          highlightSize={0.18}
          onNodeClick={handleNodeClick}
          isDraggingRef={isDraggingRef}
        />
      </group>
    </>
  )
}

interface Props {
  graph: MetisGraph; onNodeClick?: (nodeId: number) => void; onClusterClick?: (id: number) => void; onFolderClick?: (id: number) => void
  onCameraMove?: (a: number, e: number, d: number) => void
  transparent?: boolean; showLabels?: boolean
}

export default function MetisSphere3D({ graph, onNodeClick, onClusterClick, onFolderClick, onCameraMove, transparent, showLabels = false }: Props) {
  const isDraggingRef = useRef(false)
  const { settings, update, save, reset } = useSphereSettings()
  const layoutEnabled = settings.layoutMode === 'hybrid'
  const sphereLayout = useSphereLayout(layoutEnabled)
  const sphereLayoutInput: SphereLayoutInput | null = useMemo(() =>
    sphereLayout.positions
    && sphereLayout.folders
    && sphereLayout.shellRadius != null
    && sphereLayout.connectivity != null
      ? {
          positions: sphereLayout.positions,
          folders: sphereLayout.folders,
          shellRadius: sphereLayout.shellRadius,
          connectivity: sphereLayout.connectivity,
        }
      : null,
    [sphereLayout.positions, sphereLayout.folders, sphereLayout.shellRadius, sphereLayout.connectivity],
  )
  const handleCameraMove = useCallback((a: number, e: number, d: number) => { onCameraMove?.(a, e, d) }, [onCameraMove])
  return (
    <div className="w-full h-full relative" style={{ background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 120], fov: 36 }}
        style={{ background: 'transparent' }} gl={{ antialias: true, alpha: true }}>
        <MetisScene graph={graph} onNodeClick={onNodeClick} onClusterClick={onClusterClick} onFolderClick={onFolderClick}
          transparent={transparent} onCameraMove={handleCameraMove}
          showLabels={showLabels} isDraggingRef={isDraggingRef} settings={settings}
          sphereLayoutInput={sphereLayoutInput} />
      </Canvas>
      <MetisSphereSettings settings={settings} onUpdate={update} onSave={save} onReset={reset} />
    </div>
  )
}
