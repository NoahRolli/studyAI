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
const HUB_FALLBACK = [
  "#7dd4a3", "#d4a574", "#d4cc7d", "#7dd8e8", "#e88a8a",
  "#c084fc", "#fb923c", "#67e8f9", "#a78bfa", "#f472b6",
  "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#818cf8",
  "#2dd4bf", "#e879f9", "#a3e635", "#f59e0b", "#ec4899",
  "#14b8a6", "#8b5cf6", "#84cc16", "#ef4444", "#06b6d4",
]
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
      camera.position.z = Math.max(15, Math.min(200, camera.position.z + e.deltaY * 0.03))
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
  showLabels, isDraggingRef, settings }: {
  graph: MetisGraph; onNodeClick?: (id: number) => void; onClusterClick?: (id: number) => void; onFolderClick?: (id: number) => void
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
    const folders = graph.folders || []
    // Cluster -> dominanter Ordner bestimmen
    return graph.clusters.map((cluster, i) => {
      const memberNodes = (cluster.node_ids || []).map(nid => graph.nodes.find(n => n.id === nid))
      const folderCounts = new Map<number, number>()
      memberNodes.forEach(n => {
        if (n?.folder_id) folderCounts.set(n.folder_id, (folderCounts.get(n.folder_id) || 0) + 1)
      })
      let bestFid: number | null = null, bestCnt = 0
      folderCounts.forEach((cnt, fid) => { if (cnt > bestCnt) { bestFid = fid; bestCnt = cnt } })
      // Farbe: Folder-Farbe + Hue-Shift pro Cluster-Index
      let color: THREE.Color
      if (bestFid !== null) {
        const fIdx = folders.findIndex(f => f.id === bestFid)
        const baseColor = new THREE.Color(FOLDER_COLORS[fIdx >= 0 ? fIdx % FOLDER_COLORS.length : 0])
        const hsl = { h: 0, s: 0, l: 0 }
        baseColor.getHSL(hsl)
        // Leichte Hue-Variation + Sättigung/Helligkeit variieren
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
      }
    }).filter(h => h.memberCount > 0)
  }, [graph.clusters, graph.nodes, graph.folders])

  // Folder-Daten fuer Sphäre
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

  const handleHubClick = useCallback((hubId: string, _memberIds: number[]) => {
    if (isDraggingRef.current) return
    setActiveFolder(null)
    if (activeHub === hubId) { setActiveHub(null); setClickedId(null) }
    else { setActiveHub(hubId); setClickedId(null); const clId = parseInt(hubId.replace("hub-", "")); onClusterClick?.(clId) }
  }, [activeHub, onNodeClick, isDraggingRef])

  const handleFolderClick = useCallback((folderId: number) => {
    if (isDraggingRef.current) return
    setActiveHub(null); setClickedId(null)
    setActiveFolder(prev => { const next = prev === folderId ? null : folderId; if (next !== null) onFolderClick?.(next); return next })
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
  const { nodePositions, hubPositions, folderPositions, maxRadius } = useMemo(
    () => computeHierarchicalLayout(graph), [graph],
  )


  // Kamera automatisch an Sphäre-Groesse anpassen
  const { camera } = useThree()
  useEffect(() => {
    if (maxRadius > 0) {
      const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
      const dist = (maxRadius * 1.4) / Math.sin(fov / 2)
      camera.position.set(0, 0, Math.max(20, Math.min(200, dist)))
    }
  }, [maxRadius, camera])
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
          const rt = typeof edge.relation_type === 'object' && edge.relation_type ? edge.relation_type.name : (edge.relation_type || ''); const c = COLORS[rt] || COLORS.ai
          const isOnt = edge.id < 0
          return <GlowEdge key={edge.id} start={s} end={e} status={edge.status}
            relationType={typeof edge.relation_type === "object" && edge.relation_type ? edge.relation_type.name : (edge.relation_type || undefined)}
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
          return <ClusterHub key={`folder-${fd.id}`} position={pos}
            color={fd.color} size={1.2} label={fd.label} showLabel={showLabels}
            onClick={() => handleFolderClick(fd.id)}
            intensityMul={settings.nebulaIntensity * 1.3}
            sizeMul={settings.nebulaSize * 1.2}
            colorMul={settings.colorIntensity} pulse={settings.clusterPulse} />
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
            colorMul={settings.colorIntensity} pulse={settings.clusterPulse} />
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
            onClick={() => handleNodeClick(node.id)} showLabel={showLabels && hl} />
        })}
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
  const handleCameraMove = useCallback((a: number, e: number, d: number) => { onCameraMove?.(a, e, d) }, [onCameraMove])
  return (
    <div className="w-full h-full relative" style={{ background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 50], fov: 36 }}
        style={{ background: 'transparent' }} gl={{ antialias: true, alpha: true }}>
        <MetisScene graph={graph} onNodeClick={onNodeClick} onClusterClick={onClusterClick} onFolderClick={onFolderClick}
          transparent={transparent} onCameraMove={handleCameraMove}
          showLabels={showLabels} isDraggingRef={isDraggingRef} settings={settings} />
      </Canvas>
      <MetisSphereSettings settings={settings} onUpdate={update} onSave={save} onReset={reset} />
    </div>
  )
}
