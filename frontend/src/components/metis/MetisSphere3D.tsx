// MetisSphere3D — 3D Sphäre mit Cluster-Hubs, freier Trackball-Rotation
// Quaternion-basiert (kein Gimbal Lock, keine Pol-Limits)
// Drag vs Click: Klick nur wenn Maus < 5px bewegt

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

const COLORS: Record<string, THREE.Color> = {
  note: new THREE.Color('#90edb8'),
  summary: new THREE.Color('#e8b882'),
  wikilink: new THREE.Color('#e8e090'),
  ai: new THREE.Color('#6aacbe'),
  entry: new THREE.Color('#00d4ff'),
  // Ontology-Relationstypen
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
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const CLICK_THRESHOLD = 5

// --- Trackball: Gruppe drehen + Kamera zoomen ---
function TrackballControls({ groupRef, onInteract, isDraggingRef }: {
  groupRef: React.RefObject<THREE.Group | null>
  onInteract: () => void
  isDraggingRef: React.MutableRefObject<boolean>
}) {
  const { gl, camera } = useThree()
  const isPointerDown = useRef(false)
  const startMouse = useRef({ x: 0, y: 0 })
  const prevMouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      isPointerDown.current = true
      isDraggingRef.current = false
      startMouse.current = { x: e.clientX, y: e.clientY }
      prevMouse.current = { x: e.clientX, y: e.clientY }
      onInteract()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown.current || !groupRef.current) return
      // Prüfe ob genug Distanz für Drag
      const totalDx = e.clientX - startMouse.current.x
      const totalDy = e.clientY - startMouse.current.y
      if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > CLICK_THRESHOLD) {
        isDraggingRef.current = true
      }
      onInteract()
      const dx = (e.clientX - prevMouse.current.x) * 0.005
      const dy = (e.clientY - prevMouse.current.y) * 0.005
      prevMouse.current = { x: e.clientX, y: e.clientY }
      const qx = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), dx,
      )
      const qy = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), dy,
      )
      groupRef.current.quaternion.premultiply(qx)
      groupRef.current.quaternion.premultiply(qy)
    }

    const onPointerUp = () => {
      isPointerDown.current = false
      // isDraggingRef bleibt true bis nächster pointerdown
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isPointerDown.current = true
        isDraggingRef.current = false
        startMouse.current = {
          x: e.touches[0].clientX, y: e.touches[0].clientY,
        }
        prevMouse.current = {
          x: e.touches[0].clientX, y: e.touches[0].clientY,
        }
        onInteract()
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isPointerDown.current || !groupRef.current) return
      if (e.touches.length !== 1) return
      const totalDx = e.touches[0].clientX - startMouse.current.x
      const totalDy = e.touches[0].clientY - startMouse.current.y
      if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > CLICK_THRESHOLD) {
        isDraggingRef.current = true
      }
      onInteract()
      const dx = (e.touches[0].clientX - prevMouse.current.x) * 0.005
      const dy = (e.touches[0].clientY - prevMouse.current.y) * 0.005
      prevMouse.current = {
        x: e.touches[0].clientX, y: e.touches[0].clientY,
      }
      const qx = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), dx,
      )
      const qy = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), dy,
      )
      groupRef.current.quaternion.premultiply(qx)
      groupRef.current.quaternion.premultiply(qy)
    }

    const onTouchEnd = () => { isPointerDown.current = false }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      onInteract()
      const z = camera.position.z + e.deltaY * 0.03
      camera.position.z = Math.max(15, Math.min(80, z))
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [gl, camera, groupRef, onInteract, isDraggingRef])

  return null
}

function MetisScene({ graph, onNodeClick, onCameraMove, transparent,
  showLabels, isDraggingRef, settings }: {
  graph: MetisGraph
  onNodeClick?: (id: number) => void
  onCameraMove: (a: number, e: number, d: number) => void
  transparent?: boolean
  showLabels: boolean
  isDraggingRef: React.MutableRefObject<boolean>
  settings: import('../../hooks/useSphereSettings').SphereSettings
}) {
  const groupRef = useRef<THREE.Group>(null)
  const idleTime = useRef(0)
  const [clickedId, setClickedId] = useState<number | null>(null)
  const [activeHub, setActiveHub] = useState<string | null>(null)

  const handleInteract = useCallback(() => {
    idleTime.current = 0
  }, [])

  const hubData = useMemo(() => {
    if (!graph.clusters || graph.clusters.length === 0) return []
    return graph.clusters.map((cluster, i) => ({
      id: `hub-${cluster.id}`,
      label: cluster.label || `Cluster ${i + 1}`,
      color: new THREE.Color(
        cluster.color || HUB_FALLBACK[i % HUB_FALLBACK.length],
      ),
      memberNodeIds: cluster.node_ids || [],
      memberCount: (cluster.node_ids || []).length,
    }))
  }, [graph.clusters])

  // Hub-Klick: nur wenn kein Drag
  const handleHubClick = useCallback((hubId: string, memberIds: number[]) => {
    if (isDraggingRef.current) return
    if (activeHub === hubId) {
      setActiveHub(null)
      setClickedId(null)
    } else {
      setActiveHub(hubId)
      setClickedId(null)
      if (memberIds.length > 0) onNodeClick?.(memberIds[0])
    }
  }, [activeHub, onNodeClick, isDraggingRef])

  // Node-Klick: nur wenn kein Drag
  const handleNodeClick = useCallback((nodeId: number) => {
    if (isDraggingRef.current) return
    if (clickedId === nodeId) {
      setClickedId(null)
    } else {
      setClickedId(nodeId)
      setActiveHub(null)
    }
    onNodeClick?.(nodeId)
  }, [clickedId, onNodeClick, isDraggingRef])

  const isEdgeHighlighted = useCallback((srcId: number, tgtId: number) => {
    if (!clickedId) return false
    return srcId === clickedId || tgtId === clickedId
  }, [clickedId])

  const { nodePositions, hubPositions } = useMemo(() => {
    const nPos = new Map<number, [number, number, number]>()
    const hPos = new Map<string, [number, number, number]>()
    const n = graph.nodes.length
    const hCount = hubData.length
    const radius = 5 + Math.sqrt(n + hCount) * 0.8

    hubData.forEach((hub, i) => {
      const y = hCount > 1 ? 1 - (i / (hCount - 1)) * 2 : 0
      const r = Math.sqrt(1 - y * y)
      const theta = GOLDEN * i * 3
      hPos.set(hub.id, [
        Math.cos(theta) * r * radius * 0.5,
        y * radius * 0.5,
        Math.sin(theta) * r * radius * 0.5,
      ])
    })

    graph.nodes.forEach((node, i) => {
      const parentHub = hubData.find(h => h.memberNodeIds.includes(node.id))
      if (parentHub) {
        const hp = hPos.get(parentHub.id) || [0, 0, 0]
        const idx = parentHub.memberNodeIds.indexOf(node.id)
        const count = parentHub.memberNodeIds.length
        const spread = 2.5 + Math.sqrt(count) * 0.5
        const ay = count > 1 ? 1 - (idx / (count - 1)) * 2 : 0
        const ar = Math.sqrt(1 - ay * ay)
        const aTheta = GOLDEN * idx
        nPos.set(node.id, [
          hp[0] + Math.cos(aTheta) * ar * spread,
          hp[1] + ay * spread,
          hp[2] + Math.sin(aTheta) * ar * spread,
        ])
      } else {
        const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0
        const r = Math.sqrt(1 - y * y)
        const theta = GOLDEN * i
        nPos.set(node.id, [
          Math.cos(theta) * r * radius, y * radius,
          Math.sin(theta) * r * radius,
        ])
      }
    })
    return { nodePositions: nPos, hubPositions: hPos }
  }, [graph.nodes, hubData])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    idleTime.current += delta
    if (idleTime.current > 2) {
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), delta * 0.06,
      )
      groupRef.current.quaternion.premultiply(q)
    }
  })

  return (
    <>
      <TrackballControls groupRef={groupRef} onInteract={handleInteract}
        isDraggingRef={isDraggingRef} />
      <ambientLight intensity={0.1} />
      <CameraTracker onCameraMove={onCameraMove} />
      {!transparent && <BackgroundGrid />}
      <group ref={groupRef}>
        {graph.edges.map(edge => {
          const s = nodePositions.get(edge.source_node_id)
          const e = nodePositions.get(edge.target_node_id)
          if (!s || !e) return null
          const hl = isEdgeHighlighted(edge.source_node_id, edge.target_node_id)
          const c = COLORS[edge.relation_type] || COLORS.ai; const isOntology = edge.id < 0
          return <GlowEdge key={edge.id} start={s} end={e} status={edge.status}
            color={c} strength={hl ? 5.0 : (isOntology ? settings.edgeOntology : edge.strength * settings.edgeSimilarity)} />
        })}
        {hubData.map(hub => hub.memberNodeIds.map(nid => {
          const hp = hubPositions.get(hub.id)
          const np = nodePositions.get(nid)
          if (!hp || !np) return null
          const hl = activeHub === hub.id
          return <GlowEdge key={`${hub.id}-${nid}`}
            start={hp} end={np} color={hub.color}
            strength={hl ? 5.0 : 0.1} dashed={!hl} />
        }))}
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
        {graph.nodes.map(node => {
          const pos = nodePositions.get(node.id)
          if (!pos) return null
          const color = COLORS[node.type] || COLORS.note
          return <GlowNode key={node.id} position={pos} color={color} glowMul={settings.nodeGlow} colorMul={settings.colorIntensity}
            size={0.12} label={node.title}
            onClick={() => handleNodeClick(node.id)}
            showLabel={false} />
        })}
      </group>
    </>
  )
}

interface Props {
  graph: MetisGraph
  onNodeClick?: (nodeId: number) => void
  onCameraMove?: (a: number, e: number, d: number) => void
  transparent?: boolean
  showLabels?: boolean
}

export default function MetisSphere3D({
  graph, onNodeClick, onCameraMove, transparent,
  showLabels = false,
}: Props) {
  const isDraggingRef = useRef(false)
  const { settings, update, save, reset } = useSphereSettings()
  const handleCameraMove = useCallback((a: number, e: number, d: number) => {
    onCameraMove?.(a, e, d)
  }, [onCameraMove])

  return (
    <div className="w-full h-full relative" style={{ background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 50], fov: 36 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}>
        <MetisScene graph={graph} onNodeClick={onNodeClick}
          transparent={transparent} onCameraMove={handleCameraMove}
          showLabels={showLabels} isDraggingRef={isDraggingRef}
          settings={settings} />
      </Canvas>
      <MetisSphereSettings settings={settings}
        onUpdate={update} onSave={save} onReset={reset} />
    </div>
  )
}
