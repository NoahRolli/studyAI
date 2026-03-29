// MindmapSphere — 3D-Kugel-Darstellung der Mindmap
//
// Knoten werden auf konzentrischen Kugeln platziert:
// - Root im Zentrum
// - Depth 1 auf innerer Kugel
// - Depth 2+ auf äusseren Kugeln
//
// Features: Frei drehen (OrbitControls), Zoom, Klick → Detail,
// Doppelklick → Deep Dive, Ast-Farben wie bei 2D-Layouts
//
// Verwendet @react-three/fiber + @react-three/drei

import { useRef, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { MindmapTreeNode } from '../utils/mindmapStyles'

// --- Farbpalette (gleich wie in mindmapStyles.ts) ---
const BRANCH_COLORS = [
  '#00d4ff', // Cyan
  '#a855f7', // Violett
  '#34d399', // Smaragd
  '#fb923c', // Orange
  '#f472b6', // Pink
  '#facc15', // Gelb
  '#38bdf8', // Himmelblau
  '#a3e635', // Lime
]

// --- Typen für 3D-Knoten ---
interface SphereNode {
  id: number
  label: string
  detail: string
  depth: number
  hasChildren: boolean
  branchIndex: number
  position: [number, number, number]
  parentId: number | null
}

// --- Props ---
interface MindmapSphereProps {
  treeData: MindmapTreeNode[]
  onNodeSelect: (id: number, label: string, detail: string) => void
  onNodeExpand: (id: number, depth: number, hasChildren: boolean) => void
}

// --- Hilfsfunktion: Baum in flache 3D-Knotenliste umwandeln ---
function flattenToSphere(
  nodes: MindmapTreeNode[],
  parentId: number | null = null,
  parentDepth: number = 0,
  branchIndex: number = 0,
): SphereNode[] {
  const flat: SphereNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const currentBranch = parentDepth === 0 ? i : branchIndex
    flat.push({
      id: node.id,
      label: node.label,
      detail: node.detail,
      depth: node.depth_level,
      hasChildren: node.children.length > 0,
      branchIndex: currentBranch,
      position: [0, 0, 0], // Wird später berechnet
      parentId,
    })
    if (node.children.length > 0) {
      flat.push(
        ...flattenToSphere(node.children, node.id, node.depth_level, currentBranch),
      )
    }
  }
  return flat
}

// Deterministischer Pseudo-Zufall
function seededRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

// 3D-Positionen auf konzentrischen Kugeln berechnen
function assignPositions(flatNodes: SphereNode[]): SphereNode[] {
  // Gruppiere nach Tiefe
  const byDepth = new Map<number, SphereNode[]>()
  for (const node of flatNodes) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, [])
    byDepth.get(node.depth)!.push(node)
  }

  for (const [depth, group] of byDepth) {
    if (depth === 0) {
      // Root im Zentrum
      group[0].position = [0, 0, 0]
      continue
    }

    // Kugelradius pro Tiefe — genug Abstand
    const radius = 3 + (depth - 1) * 3.5

    for (let i = 0; i < group.length; i++) {
      const node = group[i]
      // Fibonacci-Kugel-Verteilung für gleichmässige Abstände
      const goldenAngle = Math.PI * (3 - Math.sqrt(5))
      const theta = goldenAngle * (i + node.branchIndex * 5)
      // y gleichmässig von -1 bis +1 verteilen
      const y = 1 - (2 * i + 1) / group.length
      const radiusAtY = Math.sqrt(1 - y * y)

      // Leichter Jitter für natürliches Feeling
      const jitter = (seededRand(node.id) - 0.5) * 0.3

      node.position = [
        Math.cos(theta) * radiusAtY * radius + jitter,
        y * radius + jitter,
        Math.sin(theta) * radiusAtY * radius + jitter,
      ]
    }
  }

  return flatNodes
}

// --- Einzelner 3D-Knoten ---
interface NodeMeshProps {
  node: SphereNode
  onSelect: (id: number, label: string, detail: string) => void
  onExpand: (id: number, depth: number, hasChildren: boolean) => void
}

function NodeMesh({ node, onSelect, onExpand }: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  // Farbe basierend auf Ast-Index
  const color = node.depth === 0
    ? BRANCH_COLORS[0]
    : BRANCH_COLORS[node.branchIndex % BRANCH_COLORS.length]

  // Knotengrösse nach Tiefe
  const size = node.depth === 0 ? 0.6 : node.depth === 1 ? 0.4 : 0.3

  // Sanfte Pulsation bei Hover
  useFrame(() => {
    if (!meshRef.current) return
    const scale = hovered ? 1.3 : 1.0
    meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1)
  })

  // Doppelklick-Erkennung via Timer
  const lastClickRef = useRef<number>(0)

  const handleClick = useCallback(() => {
    const now = Date.now()
    if (now - lastClickRef.current < 400) {
      // Doppelklick → Deep Dive
      onExpand(node.id, node.depth, node.hasChildren)
    } else {
      // Einzelklick → Detail anzeigen
      onSelect(node.id, node.label, node.detail)
    }
    lastClickRef.current = now
  }, [node, onSelect, onExpand])

  return (
    <group position={node.position}>
      {/* Kugel-Knoten */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default' }}
      >
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.3}
          transparent
          opacity={hovered ? 0.95 : 0.75}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* Label — schwebt über dem Knoten */}
      <Text
        position={[0, size + 0.3, 0]}
        fontSize={node.depth === 0 ? 0.35 : 0.22}
        color={color}
        anchorX="center"
        anchorY="bottom"
        maxWidth={3}
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {node.label}
      </Text>
    </group>
  )
}

// --- Kanten zwischen Knoten ---
interface EdgeLinesProps {
  nodes: SphereNode[]
}

function EdgeLines({ nodes }: EdgeLinesProps) {
  // Lookup: id → position
  const posMap = useMemo(() => {
    const map = new Map<number, [number, number, number]>()
    for (const node of nodes) map.set(node.id, node.position)
    return map
  }, [nodes])

  // Kanten: Jeder Knoten mit parentId → Linie zum Eltern
  const edges = useMemo(() => {
    const lines: { points: [number, number, number][]; color: string }[] = []
    for (const node of nodes) {
      if (node.parentId === null) continue
      const parentPos = posMap.get(node.parentId)
      if (!parentPos) continue

      const color = node.depth <= 1
        ? BRANCH_COLORS[0]
        : BRANCH_COLORS[node.branchIndex % BRANCH_COLORS.length]

      lines.push({
        points: [parentPos, node.position],
        color,
      })
    }
    return lines
  }, [nodes, posMap])

  return (
    <>
      {edges.map((edge, i) => (
        <Line
          key={i}
          points={edge.points}
          color={edge.color}
          lineWidth={1}
          transparent
          opacity={0.25}
        />
      ))}
    </>
  )
}

// --- Hauptkomponente ---
export default function MindmapSphere({
  treeData,
  onNodeSelect,
  onNodeExpand,
}: MindmapSphereProps) {
  // Baum flach machen und 3D-Positionen zuweisen
  const sphereNodes = useMemo(() => {
    if (treeData.length === 0) return []
    const flat = flattenToSphere(treeData)
    return assignPositions(flat)
  }, [treeData])

  if (sphereNodes.length === 0) return null

  return (
    <Canvas
      camera={{ position: [0, 0, 14], fov: 60 }}
      style={{ background: 'transparent' }}
    >
      {/* Beleuchtung */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -5]} intensity={0.3} color="#00d4ff" />

      {/* Steuerung: Frei drehen + Zoom */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        minDistance={5}
        maxDistance={30}
      />

      {/* Kanten zuerst (hinter den Knoten) */}
      <EdgeLines nodes={sphereNodes} />

      {/* Knoten */}
      {sphereNodes.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          onSelect={onNodeSelect}
          onExpand={onNodeExpand}
        />
      ))}
    </Canvas>
  )
}