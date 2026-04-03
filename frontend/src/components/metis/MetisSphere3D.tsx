// MetisSphere3D — 3D Knowledge-Graph Sphäre mit Three.js
// Inspiriert von Cryptaris + neuronales Netz + JARVIS HUD.
// Auto-Rotation, intensive Glow-Nodes, leuchtende Edges.
// Farben: Grün=Note, Orange=Summary. Lazy-loaded.

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MetisGraph } from '../../types/metis'

// Farben — satte, leuchtende Varianten für 3D
const COLORS = {
  note: new THREE.Color('#7dd4a3'),
  summary: new THREE.Color('#d4a574'),
  wikilink: new THREE.Color('#d4cc7d'),
  ai: new THREE.Color('#5a8a9a'),
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
  const outerGlowRef = useRef<THREE.Mesh>(null)

  // Sanftes Pulsieren — Kern + Glow
  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.5 + size * 10) * 0.2
    if (glowRef.current) glowRef.current.scale.setScalar(pulse)
    if (outerGlowRef.current) {
      outerGlowRef.current.scale.setScalar(pulse * 1.1)
    }
  })

  return (
    <group position={position}>
      {/* Äusserer Glow — weiches Leuchten */}
      <mesh ref={outerGlowRef}>
        <sphereGeometry args={[size * 4, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.04}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Mittlerer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2.2, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Kern-Punkt — hell, klickbar */}
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={new THREE.Color('#ffffff')} />
      </mesh>

      {/* Farbiger Ring um den Kern */}
      <mesh>
        <ringGeometry args={[size * 1.1, size * 1.4, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Label */}
      <Html
        position={[size * 4, size * 1.5, 0]}
        style={{
          color: `#${color.getHexString()}`,
          fontSize: '11px',
          fontFamily: 'Orbitron, monospace',
          whiteSpace: 'nowrap',
          textShadow: `0 0 8px #${color.getHexString()}80, 0 0 16px #${color.getHexString()}40`,
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
      opacity: 0.25 + strength * 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [color, strength])

  return <primitive ref={ref} object={new THREE.Line(geometry, material)} />
}

// --- Hintergrund-Partikel (Atmosphäre) ---
function BackgroundParticles() {
  const ref = useRef<THREE.Points>(null)

  const { geometry, material } = useMemo(() => {
    const count = 200
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: '#4a6a7a',
      size: 0.04,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry: geo, material: mat }
  }, [])

  // Langsame Rotation der Partikel
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.01
      ref.current.rotation.x += delta * 0.005
    }
  })

  return <points ref={ref} geometry={geometry} material={material} />
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

  // Auto-Rotation — sanft, stoppt bei Interaktion
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
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={30}
        onStart={() => { isInteracting.current = true }}
        onEnd={() => { isInteracting.current = false }}
      />

      {/* Minimale Ambiente-Beleuchtung */}
      <ambientLight intensity={0.15} />

      {/* Hintergrund-Partikel für Tiefe */}
      <BackgroundParticles />

      {/* Rotierende Gruppe — Graph */}
      <group ref={groupRef}>
        {/* Edges zuerst (hinter Nodes) */}
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
          // Grössere Nodes für mehr Verbindungen
          const size = 0.15 + conns * 0.05
          return (
            <GlowNode
              key={node.id}
              position={pos}
              color={color}
              size={Math.min(size, 0.45)}
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
        gl={{ antialias: true, alpha: true }}
      >
        <MetisScene graph={graph} onNodeClick={onNodeClick} />
      </Canvas>
    </div>
  )
}
