// MetisSphere3D — 3D Knowledge-Graph Sphäre mit Three.js
// JARVIS/Cryptaris-inspiriert. Intensive Farben, Glow, Partikel.
// Auto-Rotation, Kamera-Tracking für MiniMap. Lazy-loaded.

import { useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MetisGraph } from '../../types/metis'

// Farben — kräftiger für 3D
const COLORS = {
  note: new THREE.Color('#90edb8'),
  summary: new THREE.Color('#e8b882'),
  wikilink: new THREE.Color('#e8e090'),
  ai: new THREE.Color('#6aacbe'),
}

// --- GlowNode — intensiver, mehrschichtig ---
function GlowNode({ position, color, size, label, onClick }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  onClick?: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const outerRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.5 + size * 10
    const pulse = 1 + Math.sin(t) * 0.2
    const slowPulse = 1 + Math.sin(t * 0.5) * 0.1
    if (glowRef.current) glowRef.current.scale.setScalar(pulse)
    if (outerRef.current) outerRef.current.scale.setScalar(slowPulse * 1.2)
    if (pulseRef.current) {
      const expand = 1 + Math.sin(t * 0.7) * 0.3
      pulseRef.current.scale.setScalar(expand)
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.03 + Math.sin(t * 0.7) * 0.02
    }
  })

  return (
    <group position={position}>
      {/* Äusserster Puls — atmendes Feld */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[size * 6, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.03}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Äusserer Glow */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[size * 3.5, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.08}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Mittlerer Glow — intensiv */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Kern — weisser Punkt */}
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={new THREE.Color('#ffffff')} />
      </mesh>

      {/* Farbiger Ring */}
      <mesh>
        <ringGeometry args={[size * 1.2, size * 1.6, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7}
          side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Label — Orbitron, leuchtend */}
      <Html
        position={[size * 4, size * 1.5, 0]}
        style={{
          color: `#${color.getHexString()}`,
          fontSize: '11px',
          fontFamily: 'Orbitron, monospace',
          whiteSpace: 'nowrap',
          textShadow: `0 0 10px #${color.getHexString()}aa, 0 0 20px #${color.getHexString()}50`,
          pointerEvents: 'none',
          userSelect: 'none',
          letterSpacing: '0.5px',
        }}
        distanceFactor={12}
      >
        {label}
      </Html>
    </group>
  )
}

// --- GlowEdge — dicker, leuchtender ---
function GlowEdge({ start, end, color, strength }: {
  start: [number, number, number]
  end: [number, number, number]
  color: THREE.Color
  strength: number
}) {
  const ref = useRef<THREE.Line>(null)
  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start), new THREE.Vector3(...end),
    ])
  }, [start, end])
  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color, transparent: true,
      opacity: 0.35 + strength * 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [color, strength])
  return <primitive ref={ref} object={new THREE.Line(geometry, material)} />
}

// --- Fixes Hintergrund-Grid — dreht sich NICHT mit ---
function BackgroundGrid() {
  const lines = useMemo(() => {
    const group = new THREE.Group()
    const size = 50
    const step = 2.5
    const mat = new THREE.LineBasicMaterial({
      color: '#162a35', transparent: true, opacity: 0.5,
      depthWrite: false,
    })
    // Horizontale Linien
    for (let i = -size; i <= size; i += step) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, i, -0.1),
        new THREE.Vector3(size, i, -0.1),
      ])
      group.add(new THREE.Line(geo, mat))
    }
    // Vertikale Linien
    for (let i = -size; i <= size; i += step) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i, -size, -0.1),
        new THREE.Vector3(i, size, -0.1),
      ])
      group.add(new THREE.Line(geo, mat))
    }
    return group
  }, [])

  return <primitive object={lines} position={[0, 0, -20]} />
}


// --- Kamera-Tracker ---
function CameraTracker({ onCameraMove }: {
  onCameraMove: (a: number, e: number, d: number) => void
}) {
  const { camera } = useThree()
  useFrame(() => {
    const pos = camera.position
    const dist = pos.length()
    const azimuth = Math.atan2(pos.x, pos.z) * (180 / Math.PI)
    const elevation = Math.asin(pos.y / dist) * (180 / Math.PI)
    onCameraMove(azimuth, elevation, dist)
  })
  return null
}

// --- Szene ---
function MetisScene({ graph, onNodeClick, onCameraMove }: {
  graph: MetisGraph
  onNodeClick?: (id: number) => void
  onCameraMove: (a: number, e: number, d: number) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const idleTime = useRef(0)
  const isInteracting = useRef(false)

  const nodePositions = useMemo(() => {
    const positions = new Map<number, [number, number, number]>()
    const n = graph.nodes.length
    const radius = 5 + Math.sqrt(n) * 0.8
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    graph.nodes.forEach((node, i) => {
      const y = 1 - (i / (n - 1 || 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = goldenAngle * i
      positions.set(node.id, [
        Math.cos(theta) * r * radius,
        y * radius,
        Math.sin(theta) * r * radius,
      ])
    })
    return positions
  }, [graph.nodes])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (isInteracting.current) {
      idleTime.current = 0
    } else {
      idleTime.current += delta
    }
    if (idleTime.current > 2) {
      groupRef.current.rotation.y += delta * 0.06
    }
  })

  return (
    <>
      <OrbitControls
        enableDamping dampingFactor={0.05}
        minDistance={5} maxDistance={50} zoomSpeed={0.5}
        onStart={() => { isInteracting.current = true }}
        onEnd={() => { isInteracting.current = false }}
      />
      <ambientLight intensity={0.1} />
      <CameraTracker onCameraMove={onCameraMove} />
      <BackgroundGrid />
      <BackgroundGrid />
      <group ref={groupRef}>
        {graph.edges.map(edge => {
          const start = nodePositions.get(edge.source_node_id)
          const end = nodePositions.get(edge.target_node_id)
          if (!start || !end) return null
          const color = edge.relation_type === 'wikilink'
            ? COLORS.wikilink : COLORS.ai
          return (
            <GlowEdge key={edge.id} start={start} end={end}
              color={color} strength={edge.strength} />
          )
        })}
        {graph.nodes.map(node => {
          const pos = nodePositions.get(node.id)
          if (!pos) return null
          const color = COLORS[node.type] || COLORS.note
          const conns = graph.edges.filter(
            e => e.source_node_id === node.id || e.target_node_id === node.id,
          ).length
          const size = 0.18 + conns * 0.06
          return (
            <GlowNode key={node.id} position={pos} color={color}
              size={Math.min(size, 0.5)} label={node.title}
              onClick={() => onNodeClick?.(node.id)} />
          )
        })}
      </group>
    </>
  )
}

// --- Hauptkomponente ---
interface Props {
  graph: MetisGraph
  onNodeClick?: (nodeId: number) => void
  onCameraMove?: (a: number, e: number, d: number) => void
}

export default function MetisSphere3D({ graph, onNodeClick, onCameraMove }: Props) {
  const handleCameraMove = useCallback((a: number, e: number, d: number) => {
    onCameraMove?.(a, e, d)
  }, [onCameraMove])

  return (
    <div className="w-full h-full" style={{ background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0, 28], fov: 42 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <MetisScene graph={graph} onNodeClick={onNodeClick}
          onCameraMove={handleCameraMove} />
      </Canvas>
    </div>
  )
}
