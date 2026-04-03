// MetisSphere3D — 3D Knowledge-Graph Sphäre mit Three.js
// Auto-Rotation (stoppt bei Interaktion), Glow-Nodes, animierte Edges.
// Klick auf Node triggert onNodeClick. Lazy-loaded.

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MetisGraph } from '../../types/metis'

// Farben — gedämpft, HUD-Stil
const COLORS = {
  note: new THREE.Color('#7dd4a3'),
  summary: new THREE.Color('#d4a574'),
  wikilink: new THREE.Color('#d4cc7d'),
  ai: new THREE.Color('#666666'),
}

// --- Einzelner Node als leuchtender Punkt ---
function GlowNode({ position, color, size, label, onClick }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  onClick?: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  // Sanftes Pulsieren
  useFrame(({ clock }) => {
    if (glowRef.current) {
      const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.15
      glowRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group position={position}>
      {/* Kern-Punkt — klickbar */}
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Glow-Hülle */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2.5, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>

      {/* Label */}
      <Html
        position={[size * 3, size, 0]}
        style={{
          color: `#${color.getHexString()}`,
          fontSize: '10px',
          whiteSpace: 'nowrap',
          textShadow: `0 0 6px #${color.getHexString()}40`,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        distanceFactor={15}
      >
        {label}
      </Html>
    </group>
  )
}

// --- Edge als leuchtende Linie ---
function GlowEdge({ start, end, color, strength }: {
  start: [number, number, number]
  end: [number, number, number]
  color: THREE.Color
  strength: number
}) {
  const ref = useRef<THREE.Line>(null)

  const geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(...start),
      new THREE.Vector3(...end),
    ]
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [start, end])

  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15 + strength * 0.35,
      depthWrite: false,
    })
  }, [color, strength])

  return <primitive ref={ref} object={new THREE.Line(geometry, material)} />
}

// --- Szene mit Rotation ---
function MetisScene({ graph, onNodeClick }: {
  graph: MetisGraph
  onNodeClick?: (id: number) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const idleTime = useRef(0)
  const isInteracting = useRef(false)

  // Node-Positionen auf Sphäre (Fibonacci-Verteilung)
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

  // Auto-Rotation
  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (isInteracting.current) {
      idleTime.current = 0
    } else {
      idleTime.current += delta
    }
    if (idleTime.current > 2) {
      groupRef.current.rotation.y += delta * 0.08
    }
  })

  return (
    <>
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={30}
        onStart={() => { isInteracting.current = true }}
        onEnd={() => { isInteracting.current = false }}
      />
      <ambientLight intensity={0.3} />

      <group ref={groupRef}>
        {/* Edges */}
        {graph.edges.map(edge => {
          const start = nodePositions.get(edge.source_node_id)
          const end = nodePositions.get(edge.target_node_id)
          if (!start || !end) return null
          const color = edge.relation_type === 'wikilink'
            ? COLORS.wikilink : COLORS.ai
          return (
            <GlowEdge
              key={edge.id}
              start={start}
              end={end}
              color={color}
              strength={edge.strength}
            />
          )
        })}

        {/* Nodes */}
        {graph.nodes.map(node => {
          const pos = nodePositions.get(node.id)
          if (!pos) return null
          const color = COLORS[node.type] || COLORS.note
          const conns = graph.edges.filter(
            e => e.source_node_id === node.id || e.target_node_id === node.id,
          ).length
          const size = 0.12 + conns * 0.04
          return (
            <GlowNode
              key={node.id}
              position={pos}
              color={color}
              size={Math.min(size, 0.4)}
              label={node.title}
              onClick={() => onNodeClick?.(node.id)}
            />
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
}

export default function MetisSphere3D({ graph, onNodeClick }: Props) {
  return (
    <div className="w-full h-full" style={{ background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0, 15], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <MetisScene graph={graph} onNodeClick={onNodeClick} />
      </Canvas>
    </div>
  )
}
