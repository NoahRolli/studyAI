// MetisSphere3D — 3D Knowledge-Graph Sphäre mit Three.js
// Inspiriert von Cryptaris Trajectory Mapping + neuronales Netz.
// Auto-Rotation (stoppt bei Interaktion), Glow-Nodes, animierte Edges.
// Lazy-loaded — wird nur bei 3D-View importiert.

import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
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
function GlowNode({ position, color, size, label }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
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
      {/* Kern-Punkt */}
      <mesh ref={meshRef}>
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

      {/* Label — nur bei Nähe sichtbar */}
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
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end),
  ], [start, end])

  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [points])

  return (
    <line geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.15 + strength * 0.35}
        depthWrite={false}
      />
    </line>
  )
}

// --- Szene mit Rotation ---
function MetisScene({ graph }: { graph: MetisGraph }) {
  const groupRef = useRef<THREE.Group>(null)
  const controlsRef = useRef<OrbitControlsType>(null)
  const idleTime = useRef(0)
  const isInteracting = useRef(false)

  // Node-Positionen auf Sphäre berechnen (Fibonacci-Verteilung)
  const nodePositions = useMemo(() => {
    const positions = new Map<number, [number, number, number]>()
    const n = graph.nodes.length
    const radius = 5 + Math.sqrt(n) * 0.8
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))

    graph.nodes.forEach((node, i) => {
      // Fibonacci-Sphäre für gleichmässige Verteilung
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

  // Auto-Rotation — stoppt bei Interaktion
  useFrame((_, delta) => {
    if (!groupRef.current) return

    if (isInteracting.current) {
      idleTime.current = 0
    } else {
      idleTime.current += delta
    }

    // Nach 2 Sekunden Inaktivität langsam rotieren
    if (idleTime.current > 2) {
      groupRef.current.rotation.y += delta * 0.08
    }
  })

  return (
    <>
      {/* Kamera-Controls */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={30}
        onStart={() => { isInteracting.current = true }}
        onEnd={() => { isInteracting.current = false }}
      />

      {/* Ambiente Beleuchtung */}
      <ambientLight intensity={0.3} />

      {/* Rotierende Gruppe */}
      <group ref={groupRef}>
        {/* Edges */}
        {graph.edges.map(edge => {
          const start = nodePositions.get(edge.source_node_id)
          const end = nodePositions.get(edge.target_node_id)
          if (!start || !end) return null

          const color = edge.relation_type === 'wikilink'
            ? COLORS.wikilink
            : COLORS.ai

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
            />
          )
        })}
      </group>
    </>
  )
}

// --- Hauptkomponente (wird lazy-loaded) ---
interface Props {
  graph: MetisGraph
}

export default function MetisSphere3D({ graph }: Props) {
  return (
    <div className="w-full h-full" style={{ background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0, 15], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <MetisScene graph={graph} />
      </Canvas>
    </div>
  )
}
