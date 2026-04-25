// InstancedEdges — Konsolidierte LineSegments mit Custom RGBA-Shader
// Phase 2.1: Minimal-Implementation, funktional identisch zur GlowEdge-Schleife
// nur in einem einzigen Draw-Call statt N. Glow + Effekte folgen in 2.2/2.3.
//
// Architektur:
// - BufferGeometry mit position + RGBA pro Vertex (statt RGB im LineBasicMaterial)
// - Custom ShaderMaterial: Vertex-Shader passt nichts an, Fragment-Shader nimmt Alpha
// - NormalBlending: ueberlappende Edges mischen sich natuerlich

import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'

const MAX_EDGES = 200000

// === Vertex-Shader ===
// Setzt nur die Position und reicht die Farbe weiter — Standard-Pipeline
const VERTEX_SHADER = `
  attribute vec4 vertexColor;
  varying vec4 vColor;
  void main() {
    vColor = vertexColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// === Fragment-Shader ===
// Nimmt die interpolierte RGBA-Farbe vom Vertex-Shader und schreibt sie raus
// Wichtig: kein discard, kein Alpha-Test — wir wollen sanfte Transparenz
const FRAGMENT_SHADER = `
  varying vec4 vColor;
  void main() {
    gl_FragColor = vColor;
  }
`

export interface InstancedEdge {
  start: [number, number, number]
  end: [number, number, number]
  color: THREE.Color
  /** Alpha pro Edge: 0 = unsichtbar, 1 = volle Helligkeit */
  alpha: number
}

interface InstancedEdgesProps {
  edges: InstancedEdge[]
}

export default function InstancedEdges({ edges }: InstancedEdgesProps) {
  const geomRef = useRef<THREE.BufferGeometry>(null)

  // Pre-allocated Buffer fuer Position (3 floats) und Color (RGBA = 4 floats) pro Vertex
  // Jede Edge = 2 Vertices, also 2 * 3 = 6 position floats und 2 * 4 = 8 color floats
  const positions = useMemo(() => new Float32Array(MAX_EDGES * 2 * 3), [])
  const vertexColors = useMemo(() => new Float32Array(MAX_EDGES * 2 * 4), [])

  // ShaderMaterial einmal erzeugen, nicht bei jedem Render neu
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useEffect(() => {
    const geom = geomRef.current
    if (!geom) return

    const count = Math.min(edges.length, MAX_EDGES)

    for (let i = 0; i < count; i++) {
      const e = edges[i]
      const posOff = i * 6   // 2 vertices * 3 floats
      const colOff = i * 8   // 2 vertices * 4 floats (RGBA)

      // Position: start + end
      positions[posOff] = e.start[0]
      positions[posOff + 1] = e.start[1]
      positions[posOff + 2] = e.start[2]
      positions[posOff + 3] = e.end[0]
      positions[posOff + 4] = e.end[1]
      positions[posOff + 5] = e.end[2]

      // Vertex-Color: RGBA fuer beide Vertices der Edge
      // Volle Farbe, Alpha steuert die Sichtbarkeit
      vertexColors[colOff] = e.color.r
      vertexColors[colOff + 1] = e.color.g
      vertexColors[colOff + 2] = e.color.b
      vertexColors[colOff + 3] = e.alpha
      vertexColors[colOff + 4] = e.color.r
      vertexColors[colOff + 5] = e.color.g
      vertexColors[colOff + 6] = e.color.b
      vertexColors[colOff + 7] = e.alpha
    }

    geom.setDrawRange(0, count * 2)
    geom.attributes.position.needsUpdate = true
    geom.attributes.vertexColor.needsUpdate = true
  }, [edges, positions, vertexColors])

  return (
    <lineSegments frustumCulled={false} material={material}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-vertexColor"
          args={[vertexColors, 4]}
        />
      </bufferGeometry>
    </lineSegments>
  )
}
