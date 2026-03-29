// MindmapSphere — 3D Hologramm-Netzwerk (JARVIS-Style)
//
// Freischwebendes Netzwerk mit leuchtenden Knoten und Glow-Kanten
// Knoten schweben im Raum, verbunden durch pulsierende Linien
// Keine Kugeloberfläche — offenes, organisches 3D-Netzwerk
//
// Features: Frei drehen, Zoom, Klick → Detail, Doppelklick → Deep Dive
// Ast-Farben konsistent mit 2D-Layouts

import { useRef, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { MindmapTreeNode } from '../utils/mindmapStyles'

// --- Ast-Farben (identisch mit mindmapStyles.ts) ---
const BRANCH_HEX = [
  '#00d4ff', '#a855f7', '#34d399', '#fb923c',
  '#f472b6', '#facc15', '#38bdf8', '#a3e635',
]

// --- Typen ---
interface HoloNode {
  id: number
  label: string
  detail: string
  depth: number
  hasChildren: boolean
  branchIndex: number
  pos: THREE.Vector3
  parentId: number | null
}

interface MindmapSphereProps {
  treeData: MindmapTreeNode[]
  onNodeSelect: (id: number, label: string, detail: string) => void
  onNodeExpand: (id: number, depth: number, hasChildren: boolean) => void
}

// --- Deterministischer Zufall ---
function sRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

// --- Baum → flache Liste ---
function flattenTree(
  nodes: MindmapTreeNode[],
  parentId: number | null = null,
  parentDepth: number = 0,
  branchIndex: number = 0,
): HoloNode[] {
  const flat: HoloNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const branch = parentDepth === 0 ? i : branchIndex
    flat.push({
      id: node.id,
      label: node.label,
      detail: node.detail,
      depth: node.depth_level,
      hasChildren: node.children.length > 0,
      branchIndex: branch,
      pos: new THREE.Vector3(),
      parentId,
    })
    if (node.children.length > 0) {
      flat.push(...flattenTree(node.children, node.id, node.depth_level, branch))
    }
  }
  return flat
}

// --- Positionen zuweisen: Netzwerk-Layout ---
// Jeder Ast bekommt eine Richtung vom Zentrum weg
// Kinder folgen ihrem Eltern-Ast mit Streuung
function assignPositions(nodes: HoloNode[]): HoloNode[] {
  const branches = new Set(nodes.map((n) => n.branchIndex))
  const branchDirs = new Map<number, THREE.Vector3>()
  let idx = 0
  const branchCount = branches.size || 1

  for (const b of branches) {
    // Fibonacci-Kugel für gleichmässige Ast-Richtungen
    const golden = Math.PI * (3 - Math.sqrt(5))
    const y = 1 - (2 * idx + 1) / branchCount
    const radius = Math.sqrt(1 - y * y)
    const theta = golden * idx
    branchDirs.set(b, new THREE.Vector3(
      Math.cos(theta) * radius,
      y * 0.6,
      Math.sin(theta) * radius,
    ).normalize())
    idx++
  }

  for (const node of nodes) {
    if (node.depth === 0) {
      node.pos.set(0, 0, 0)
      continue
    }

    const dir = branchDirs.get(node.branchIndex) ?? new THREE.Vector3(1, 0, 0)
    const dist = 2.5 + (node.depth - 1) * 2.2
    const spread = 0.4 + node.depth * 0.2
    const oX = (sRand(node.id * 3) - 0.5) * spread
    const oY = (sRand(node.id * 7) - 0.5) * spread
    const oZ = (sRand(node.id * 11) - 0.5) * spread

    node.pos.set(dir.x * dist + oX, dir.y * dist + oY, dir.z * dist + oZ)
  }

  return nodes
}

// --- Einzelner leuchtender Knoten ---
interface GlowNodeProps {
  node: HoloNode
  onSelect: (id: number, label: string, detail: string) => void
  onExpand: (id: number, depth: number, hasChildren: boolean) => void
}

function GlowNode({ node, onSelect, onExpand }: GlowNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const lastClickRef = useRef(0)

  const color = node.depth === 0
    ? BRANCH_HEX[0]
    : BRANCH_HEX[node.branchIndex % BRANCH_HEX.length]

  const size = node.depth === 0 ? 0.25 : node.depth === 1 ? 0.18 : 0.12

  // Sanfte Animation: Pulsieren + Hover-Skalierung
  useFrame(({ clock }) => {
    if (!meshRef.current || !glowRef.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 2 + node.id) * 0.05
    const scale = (hovered ? 1.6 : 1.0) * pulse
    meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1)
    const gs = scale * 2.5
    glowRef.current.scale.lerp(new THREE.Vector3(gs, gs, gs), 0.1)
    const glowMat = glowRef.current.material as THREE.MeshBasicMaterial
    glowMat.opacity = hovered ? 0.15 : 0.06
  })

  const handleClick = useCallback(() => {
    const now = Date.now()
    if (now - lastClickRef.current < 400) {
      onExpand(node.id, node.depth, node.hasChildren)
    } else {
      onSelect(node.id, node.label, node.detail)
    }
    lastClickRef.current = now
  }, [node, onSelect, onExpand])

  return (
    <group position={node.pos}>
      {/* Äusserer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </mesh>

      {/* Innerer Kern */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default' }}
      >
        <sphereGeometry args={[size, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.5 : 0.8}
          transparent
          opacity={hovered ? 1.0 : 0.85}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>

      {/* Label — nur bei Hover oder depth <= 1 */}
      {(hovered || node.depth <= 1) && (
        <Text
          position={[0, size + 0.25, 0]}
          fontSize={node.depth === 0 ? 0.28 : 0.18}
          color={color}
          anchorX="center"
          anchorY="bottom"
          maxWidth={2.5}
          outlineWidth={0.015}
          outlineColor="#000000"
          fillOpacity={hovered ? 1.0 : 0.7}
        >
          {node.label}
        </Text>
      )}
    </group>
  )
}

// --- Leuchtende Verbindungslinien ---
function HoloEdges({ nodes }: { nodes: HoloNode[] }) {
  const linesRef = useRef<THREE.Group>(null)

  const edges = useMemo(() => {
    const posMap = new Map<number, THREE.Vector3>()
    for (const n of nodes) posMap.set(n.id, n.pos)

    const result: { start: THREE.Vector3; end: THREE.Vector3; color: string }[] = []
    for (const node of nodes) {
      if (node.parentId === null) continue
      const parentPos = posMap.get(node.parentId)
      if (!parentPos) continue
      const color = node.depth <= 1
        ? BRANCH_HEX[0]
        : BRANCH_HEX[node.branchIndex % BRANCH_HEX.length]
      result.push({ start: parentPos, end: node.pos, color })
    }
    return result
  }, [nodes])

  // Sanftes Pulsieren der Kanten
  useFrame(({ clock }) => {
    if (!linesRef.current) return
    const pulse = 0.3 + Math.sin(clock.elapsedTime * 1.5) * 0.1
    linesRef.current.children.forEach((child) => {
      const mat = (child as THREE.Line).material
      if (mat instanceof THREE.LineBasicMaterial) {
        mat.opacity = pulse
      }
    })
  })

  return (
    <group ref={linesRef}>
      {edges.map((edge, i) => (
        <primitive
          key={i}
          object={(() => {
            const geo = new THREE.BufferGeometry().setFromPoints([edge.start, edge.end])
            const mat = new THREE.LineBasicMaterial({
              color: edge.color,
              transparent: true,
              opacity: 0.3,
              depthWrite: false,
            })
            return new THREE.Line(geo, mat)
          })()}
        />
      ))}
    </group>
  )
}

// --- Hauptkomponente ---
export default function MindmapSphere({
  treeData,
  onNodeSelect,
  onNodeExpand,
}: MindmapSphereProps) {
  const holoNodes = useMemo(() => {
    if (treeData.length === 0) return []
    return assignPositions(flattenTree(treeData))
  }, [treeData])

  if (holoNodes.length === 0) return null

  return (
    <Canvas
      camera={{ position: [0, 2, 10], fov: 55 }}
      style={{ background: 'transparent' }}
      gl={{ antialias: true, alpha: true }}
    >
      {/* Dunkle Beleuchtung — Hologramm-Feeling */}
      <ambientLight intensity={0.15} />
      <pointLight position={[5, 5, 5]} intensity={0.4} color="#00d4ff" />
      <pointLight position={[-5, -3, -5]} intensity={0.2} color="#a855f7" />

      {/* Steuerung */}
      <OrbitControls
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
        minDistance={3}
        maxDistance={25}
        autoRotate
        autoRotateSpeed={0.3}
      />

      {/* Kanten */}
      <HoloEdges nodes={holoNodes} />

      {/* Knoten */}
      {holoNodes.map((node) => (
        <GlowNode
          key={node.id}
          node={node}
          onSelect={onNodeSelect}
          onExpand={onNodeExpand}
        />
      ))}
    </Canvas>
  )
}