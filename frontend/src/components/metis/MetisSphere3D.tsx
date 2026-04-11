// MetisSphere3D — 3D Sphäre mit Folder-Hubs, Cluster-Nebel, Konzept-Nodes
// Hierarchische Positionierung: Ordner -> Cluster -> Konzepte
// Quaternion-basierte Trackball-Rotation (kein Gimbal Lock)

import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { MetisGraph } from '../../types/metis'
import {
  GlowNode, ClusterHub, BackgroundGrid, CameraTracker,
} from './MetisSphereNodes'
import { GlowEdge } from './MetisSphereEdge'
import MetisSphereSettings from './MetisSphereSettings'
import { useSphereSettings } from '../../hooks/useSphereSettings'
import { computeHierarchicalLayout } from './MetisSphereLayout'

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
const HUB_FALLBACK = ['#7dd4a3', '#d4a574', '#d4cc7d', '#7dd8e8', '#888888']
const FOLDER_COLORS = ['#00d4ff', '#ff6b9d', '#4ade80', '#fb923c', '#c084fc', '#67e8f9']
const CLICK_THRESHOLD = 5

// --- Trackball: Gruppe drehen + Kamera zoomen ---
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
      camera.position.z = Math.max(15, Math.min(80, camera.position.z + e.deltaY * 0.03))
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

function MetisScene({ graph, onNodeClick, onCameraMove, transparent,
  showLabels, isDraggingRef, settings }: {
  graph: MetisGraph; onNodeClick?: (id: number) => void
  onCameraMove: (a: number, e: number, d: number) => void
  transparent?: boolean; showLabels: boolean
  isDraggingRef: React.MutableRefObject<boolean>
  settings: import('../../hooks/useSphereSettings').SphereSettings
}) {
  const groupRef = useRef<THREE.Group>(null)
  const idleTime = useRef(0)
  const [clickedId, setClickedId] = useState<number | null>(null)
  const [activeHub, setActiveHub] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<number | null>(null)
  const handleInteract = useCallback(() => { idleTime.current = 0 }, [])

  const hubData = useMemo(() => {
    if (!graph.clusters || graph.clusters.length === 0) return []
    return graph.clusters.map((cluster, i) => ({
      id: `hub-${cluster.id}`, label: cluster.label || `Cluster ${i + 1}`,
      color: new THREE.Color(cluster.color || HUB_FALLBACK[i % HUB_FALLBACK.length]),
      memberNodeIds: cluster.node_ids || [],
      memberCount: (cluster.node_ids || []).length,
    }))
  }, [graph.clusters])

  // Folder-Daten fuer Sphäre
  const folderData = useMemo(() => {
    return (graph.folders || []).map((f, i) => ({
      id: f.id, label: f.name,
      color: new THREE.Color(FOLDER_COLORS[i % FOLDER_COLORS.length]),
    }))
  }, [graph.folders])

  // Alle Node-IDs die zu einem Ordner gehoeren
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

  // Aktive Highlight-Node-IDs (Folder oder Hub oder Einzel-Node)
  const highlightSet = useMemo(() => {
    if (activeFolder) return folderNodeIds.get(activeFolder) || new Set<number>()
    if (activeHub) {
      const hub = hubData.find(h => h.id === activeHub)
      return new Set(hub?.memberNodeIds || [])
    }
    if (clickedId) return new Set([clickedId])
    return new Set<number>()
  }, [activeFolder, activeHub, clickedId, folderNodeIds, hubData])

  const handleHubClick = useCallback((hubId: string, memberIds: number[]) => {
    if (isDraggingRef.current) return
    setActiveFolder(null)
    if (activeHub === hubId) { setActiveHub(null); setClickedId(null) }
    else { setActiveHub(hubId); setClickedId(null); if (memberIds.length > 0) onNodeClick?.(memberIds[0]) }
  }, [activeHub, onNodeClick, isDraggingRef])

  const handleFolderClick = useCallback((folderId: number) => {
    if (isDraggingRef.current) return
    setActiveHub(null); setClickedId(null)
    setActiveFolder(prev => prev === folderId ? null : folderId)
  }, [isDraggingRef])

  const handleNodeClick = useCallback((nodeId: number) => {
    if (isDraggingRef.current) return
    setClickedId(prev => prev === nodeId ? null : nodeId)
    setActiveHub(null); setActiveFolder(null); onNodeClick?.(nodeId)
  }, [onNodeClick, isDraggingRef])

  const isEdgeHighlighted = useCallback((srcId: number, tgtId: number) => {
    if (highlightSet.size === 0) return false
    return highlightSet.has(srcId) || highlightSet.has(tgtId)
  }, [highlightSet])

  // Hierarchisches Layout berechnen
  const { nodePositions, hubPositions, folderPositions } = useMemo(
    () => computeHierarchicalLayout(graph), [graph],
  )

  // Idle-Rotation
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
      <TrackballControls groupRef={groupRef} onInteract={handleInteract} isDraggingRef={isDraggingRef} />
      <ambientLight intensity={0.1} />
      <CameraTracker onCameraMove={onCameraMove} />
      {!transparent && <BackgroundGrid />}
      <group ref={groupRef}>
        {/* Edges */}
        {graph.edges.map(edge => {
          const s = nodePositions.get(edge.source_node_id)
          const e = nodePositions.get(edge.target_node_id)
          if (!s || !e) return null
          const hl = isEdgeHighlighted(edge.source_node_id, edge.target_node_id)
          const c = COLORS[edge.relation_type] || COLORS.ai
          const isOnt = edge.id < 0
          return <GlowEdge key={edge.id} start={s} end={e} status={edge.status}
            relationType={edge.relation_type}
            showMarker={isOnt && settings.showOntologyMarkers}
            showLabel={isOnt && settings.showEdgeLabels}
            thickness={isOnt ? settings.ontologyThickness : 1}
            color={c} strength={hl ? 5.0 : (isOnt ? settings.edgeOntology : edge.strength * settings.edgeSimilarity)} />
        })}
        {/* Cluster-Hub zu Node Verbindungen */}
        {hubData.map(hub => hub.memberNodeIds.map(nid => {
          const hp = hubPositions.get(hub.id); const np = nodePositions.get(nid)
          if (!hp || !np) return null
          const hl = activeHub === hub.id || highlightSet.has(nid)
          return <GlowEdge key={`${hub.id}-${nid}`} start={hp} end={np}
            color={hub.color} strength={hl ? 5.0 : 0.1} dashed={!hl} />
        }))}
        {/* Folder-Hub zu Cluster-Hub Verbindungen */}
        {folderData.map(fd => {
          const fPos = folderPositions.get(fd.id)
          if (!fPos) return null
          // Finde Cluster die zu diesem Ordner gehoeren
          return hubData.filter(hub => {
            const clId = parseInt(hub.id.replace('hub-', ''))
            const cl = graph.clusters?.find(c => c.id === clId)
            if (!cl) return false
            const folderCounts = new Map<number, number>()
            cl.node_ids.forEach(nid => {
              const node = graph.nodes.find(nd => nd.id === nid)
              if (node?.folder_id) folderCounts.set(node.folder_id, (folderCounts.get(node.folder_id) || 0) + 1)
            })
            let bestFid: number | null = null, bestCnt = 0
            folderCounts.forEach((cnt, fid) => { if (cnt > bestCnt) { bestFid = fid; bestCnt = cnt } })
            return bestFid === fd.id
          }).map(hub => {
            const hp = hubPositions.get(hub.id)
            if (!hp) return null
            return <GlowEdge key={`folder-${fd.id}-${hub.id}`} start={fPos} end={hp}
              color={fd.color} strength={activeFolder === fd.id ? 3.0 : 0.15} dashed={activeFolder !== fd.id} />
          })
        })}
        {/* Folder-Hubs (grosse leuchtende Anker) */}
        {folderData.map(fd => {
          const pos = folderPositions.get(fd.id)
          if (!pos) return null
          const folderNodeIds = graph.nodes.filter(nd => nd.folder_id === fd.id).map(nd => nd.id)
          return <ClusterHub key={`folder-${fd.id}`} position={pos}
            color={fd.color} size={1.2} label={fd.label} showLabel={showLabels}
            onClick={() => handleFolderClick(fd.id)}
            intensityMul={settings.nebulaIntensity * 1.3}
            sizeMul={settings.nebulaSize * 1.2}
            colorMul={settings.colorIntensity} />
        })}
        {/* Cluster-Hubs (mittlere Nebel) */}
        {hubData.map(hub => {
          const pos = hubPositions.get(hub.id)
          if (!pos) return null
          const size = 0.35 + hub.memberCount * 0.08
          return <ClusterHub key={hub.id} position={pos}
            color={hub.color} size={Math.min(size, 1.1)}
            label={hub.label} showLabel={showLabels}
            onClick={() => handleHubClick(hub.id, hub.memberNodeIds)}
            intensityMul={settings.nebulaIntensity}
            sizeMul={settings.nebulaSize}
            colorMul={settings.colorIntensity} />
        })}
        {/* Konzept-Nodes */}
        {graph.nodes.map(node => {
          const pos = nodePositions.get(node.id)
          if (!pos) return null
          const hub = hubData.find(h => h.memberNodeIds.includes(node.id))
          const clusterColor = hub ? hub.color.clone() : new THREE.Color('#ffffff')
          const baseColor = settings.showNodeColors ? clusterColor : new THREE.Color('#ffffff')
          const hl = highlightSet.has(node.id)
          return <GlowNode key={node.id} position={pos} color={baseColor}
            glowMul={hl ? settings.nodeGlow * 2.5 : settings.nodeGlow}
            colorMul={hl ? settings.colorIntensity * 1.5 : settings.colorIntensity}
            size={hl ? 0.18 : 0.12} label={node.title}
            onClick={() => handleNodeClick(node.id)} showLabel={hl} />
        })}
      </group>
    </>
  )
}

interface Props {
  graph: MetisGraph; onNodeClick?: (nodeId: number) => void
  onCameraMove?: (a: number, e: number, d: number) => void
  transparent?: boolean; showLabels?: boolean
}

export default function MetisSphere3D({ graph, onNodeClick, onCameraMove, transparent, showLabels = false }: Props) {
  const isDraggingRef = useRef(false)
  const { settings, update, save, reset } = useSphereSettings()
  const handleCameraMove = useCallback((a: number, e: number, d: number) => { onCameraMove?.(a, e, d) }, [onCameraMove])
  return (
    <div className="w-full h-full relative" style={{ background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 50], fov: 36 }}
        style={{ background: 'transparent' }} gl={{ antialias: true, alpha: true }}>
        <MetisScene graph={graph} onNodeClick={onNodeClick}
          transparent={transparent} onCameraMove={handleCameraMove}
          showLabels={showLabels} isDraggingRef={isDraggingRef} settings={settings} />
      </Canvas>
      <MetisSphereSettings settings={settings} onUpdate={update} onSave={save} onReset={reset} />
    </div>
  )
}
