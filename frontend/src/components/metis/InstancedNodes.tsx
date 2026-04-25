// InstancedNodes — Alle Konzept-Nodes als eine einzige InstancedMesh
// Ersetzt die bisherige Schleife aus N einzelnen <GlowNode>-Komponenten
// Ziel: 1 Draw-Call statt N, plus O(1) Matrix-Pipeline statt O(N)
//
// Performance-Kritisch:
// - Zwei getrennte Effects: statische Daten (nodes) und Highlights
// - Nur tatsaechlich vorhandene Instanzen werden geschrieben, Rest unsichtbar
// - count wird via mesh.count gesetzt, Three.js rendert dann nur so viele

import { useRef, useEffect, useCallback, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

// Ueberdimensioniert fuer zukuenftige ChatGPT/Gemini Imports
const MAX_NODES = 30000

// Wiederverwendbare Temporaere (vermeidet Allokationen pro Update)
const tempObject = new THREE.Object3D()
const tempColor = new THREE.Color()

interface InstancedNodesProps {
  nodes: Array<{
    id: number
    position: [number, number, number]
    color: THREE.Color
  }>
  highlightSet: Set<number>
  colorIntensity: number
  highlightBoost: number
  baseSize: number
  highlightSize: number
  onNodeClick: (nodeId: number) => void
  isDraggingRef: React.MutableRefObject<boolean>
}

export default function InstancedNodes({
  nodes, highlightSet, colorIntensity, highlightBoost,
  baseSize, highlightSize, onNodeClick, isDraggingRef,
}: InstancedNodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  // === Effect 1: Statische Daten (Position, Basis-Farbe, Count) ===
  // Laeuft nur wenn sich die Nodes oder Groessen aendern, NICHT bei Highlight-Wechsel
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const count = Math.min(nodes.length, MAX_NODES)

    for (let i = 0; i < count; i++) {
      const node = nodes[i]
      tempObject.position.set(node.position[0], node.position[1], node.position[2])
      tempObject.scale.setScalar(baseSize)
      tempObject.updateMatrix()
      mesh.setMatrixAt(i, tempObject.matrix)

      tempColor.copy(node.color).multiplyScalar(colorIntensity)
      mesh.setColorAt(i, tempColor)
    }

    // Three.js rendert nur mesh.count Instanzen — damit sparen wir die "unsichtbar-Matrizen"
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [nodes, colorIntensity, baseSize])

  // === Effect 2: Highlight-Overlay ===
  // Laeuft nur bei Highlight-Wechsel, schreibt nur die betroffenen Nodes
  // Vorgehen: alle auf base zuruecksetzen, dann highlighted ueberschreiben
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const count = Math.min(nodes.length, MAX_NODES)

    // Wenn kein Highlight aktiv ist, alle auf base zuruecksetzen und fertig
    // Wenn Highlight aktiv ist, alle auf base + nur die gehighlighteten ueberschreiben
    for (let i = 0; i < count; i++) {
      const node = nodes[i]
      const hl = highlightSet.has(node.id)
      const size = hl ? highlightSize : baseSize
      const mul = hl ? highlightBoost : colorIntensity

      tempObject.position.set(node.position[0], node.position[1], node.position[2])
      tempObject.scale.setScalar(size)
      tempObject.updateMatrix()
      mesh.setMatrixAt(i, tempObject.matrix)

      tempColor.copy(node.color).multiplyScalar(mul)
      mesh.setColorAt(i, tempColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [highlightSet, nodes, highlightSize, baseSize, colorIntensity, highlightBoost])

  // === Click via instanceId ===
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (isDraggingRef.current) return
    if (e.instanceId === undefined || e.instanceId === null) return
    const node = nodes[e.instanceId]
    if (!node) return
    onNodeClick(node.id)
  }, [nodes, onNodeClick, isDraggingRef])

  // Initial-Color-Buffer, damit instanceColor existiert
  const colorArray = useMemo(() => new Float32Array(MAX_NODES * 3), [])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_NODES]}
      onClick={handleClick}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial />
      <instancedBufferAttribute
        attach="instanceColor"
        args={[colorArray, 3]}
      />
    </instancedMesh>
  )
}
