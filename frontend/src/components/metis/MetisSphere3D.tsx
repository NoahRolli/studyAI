// MetisSphere3D — 3D Sphäre mit Cluster-Hubs, voller Rotation, Label-Toggle

import { useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { MetisGraph } from '../../types/metis'
import {
  GlowNode, ClusterHub, GlowEdge, BackgroundGrid, CameraTracker,
} from './MetisSphereNodes'

// Farben pro Node-Typ
const COLORS: Record<string, THREE.Color> = {
  note: new THREE.Color('#90edb8'),
  summary: new THREE.Color('#e8b882'),
  wikilink: new THREE.Color('#e8e090'),
  ai: new THREE.Color('#6aacbe'),
  entry: new THREE.Color('#00d4ff'),
}

// Fallback-Farben für Cluster-Hubs
const HUB_FALLBACK = [
  '#7dd4a3', '#d4a574', '#d4cc7d', '#7dd8e8', '#888888',
]
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// --- Szene mit Cluster-Hub-Layout ---
function MetisScene({ graph, onNodeClick, onCameraMove, transparent, showLabels }: {
  graph: MetisGraph
  onNodeClick?: (id: number) => void
  onCameraMove: (a: number, e: number, d: number) => void
  transparent?: boolean
  showLabels: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const idleTime = useRef(0)
  const isInteracting = useRef(false)

  // Hub-Daten aus Cluster-Info
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

    // Nodes positionieren — um ihren Hub herum oder global
    graph.nodes.forEach((node, i) => {
      const parentHub = hubData.find(
        h => h.memberNodeIds.includes(node.id),
      )
      if (parentHub) {
        const hubPos = hPos.get(parentHub.id) || [0, 0, 0]
        const siblings = parentHub.memberNodeIds
        const idx = siblings.indexOf(node.id)
        const count = siblings.length
        const spread = 2.5 + Math.sqrt(count) * 0.5
        const ay = count > 1 ? 1 - (idx / (count - 1)) * 2 : 0
        const ar = Math.sqrt(1 - ay * ay)
        const aTheta = GOLDEN * idx
        nPos.set(node.id, [
          hubPos[0] + Math.cos(aTheta) * ar * spread,
          hubPos[1] + ay * spread,
          hubPos[2] + Math.sin(aTheta) * ar * spread,
        ])
      } else {
        // Kein Cluster — globale Fibonacci-Sphäre
        const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0
        const r = Math.sqrt(1 - y * y)
        const theta = GOLDEN * i
        nPos.set(node.id, [
          Math.cos(theta) * r * radius,
          y * radius,
          Math.sin(theta) * r * radius,
        ])
      }
    })
    return { nodePositions: nPos, hubPositions: hPos }
  }, [graph.nodes, hubData])

  // Auto-Rotation
  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (isInteracting.current) { idleTime.current = 0 }
    else { idleTime.current += delta }
    if (idleTime.current > 2) groupRef.current.rotation.y += delta * 0.06
  })

  return (
    <>
      {/* Volle 3D-Rotation — Polar 0 bis PI */}
      <OrbitControls
        enableDamping dampingFactor={0.05}
        minDistance={5} maxDistance={50} zoomSpeed={0.5}
        minPolarAngle={0} maxPolarAngle={Math.PI}
        onStart={() => { isInteracting.current = true }}
        onEnd={() => { isInteracting.current = false }}
      />
      <ambientLight intensity={0.1} />
      <CameraTracker onCameraMove={onCameraMove} />
      {!transparent && <BackgroundGrid />}
      <group ref={groupRef}>
        {/* Reguläre Edges */}
        {graph.edges.map(edge => {
          const s = nodePositions.get(edge.source_node_id)
          const e = nodePositions.get(edge.target_node_id)
          if (!s || !e) return null
          const c = edge.relation_type === 'wikilink'
            ? COLORS.wikilink : COLORS.ai
          return <GlowEdge key={edge.id} start={s} end={e}
            color={c} strength={edge.strength} />
        })}
        {/* Hub → Member Edges (gestrichelt) */}
        {hubData.map(hub => hub.memberNodeIds.map(nid => {
          const hp = hubPositions.get(hub.id)
          const np = nodePositions.get(nid)
          if (!hp || !np) return null
          return <GlowEdge key={`${hub.id}-${nid}`}
            start={hp} end={np} color={hub.color}
            strength={0.4} dashed />
        }))}
        {/* Cluster-Hub Nodes */}
        {hubData.map(hub => {
          const pos = hubPositions.get(hub.id)
          if (!pos) return null
          const size = 0.35 + hub.memberCount * 0.08
          return <ClusterHub key={hub.id} position={pos}
            color={hub.color} size={Math.min(size, 0.9)}
            label={hub.label} showLabel={showLabels} />
        })}
        {/* Reguläre Nodes */}
        {graph.nodes.map(node => {
          const pos = nodePositions.get(node.id)
          if (!pos) return null
          const color = COLORS[node.type] || COLORS.note
          const conns = graph.edges.filter(
            e => e.source_node_id === node.id
              || e.target_node_id === node.id,
          ).length
          const size = 0.18 + conns * 0.06
          return <GlowNode key={node.id} position={pos} color={color}
            size={Math.min(size, 0.5)} label={node.title}
            onClick={() => onNodeClick?.(node.id)}
            showLabel={showLabels} />
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
  showLabels = true,
}: Props) {
  const handleCameraMove = useCallback((a: number, e: number, d: number) => {
    onCameraMove?.(a, e, d)
  }, [onCameraMove])

  return (
    <div className="w-full h-full" style={{ background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0, 34], fov: 40 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <MetisScene graph={graph} onNodeClick={onNodeClick}
          transparent={transparent} onCameraMove={handleCameraMove}
          showLabels={showLabels} />
      </Canvas>
    </div>
  )
}
