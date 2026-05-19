// InstancedEdges — Konsolidierte LineSegments mit Custom RGBA-Shader
// Phase 2.1: Minimal-Implementation, funktional identisch zur GlowEdge-Schleife
// nur in einem einzigen Draw-Call statt N. Glow + Effekte folgen in 2.2/2.3.
//
// Architektur:
// - BufferGeometry mit position + RGBA pro Vertex (statt RGB im LineBasicMaterial)
// - Custom ShaderMaterial: Vertex-Shader passt nichts an, Fragment-Shader nimmt Alpha
// - NormalBlending: ueberlappende Edges mischen sich natuerlich

import { useEffect, useMemo } from 'react'
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
  // Pre-allocated Buffer (persistent über React-Re-Renders)
  const positions = useMemo(() => new Float32Array(MAX_EDGES * 2 * 3), [])
  const vertexColors = useMemo(() => new Float32Array(MAX_EDGES * 2 * 4), [])

  // BufferAttributes IMPERATIV erstellen — werden NICHT pro React-Render neu gemacht
  // Vorher: <bufferAttribute /> in JSX wurde von R3F bei jedem Re-Render frisch
  // attached -> alte Daten weg -> Flicker zwischen Frames
  const positionAttr = useMemo(
    () => new THREE.BufferAttribute(positions, 3),
    [positions],
  )
  const colorAttr = useMemo(
    () => new THREE.BufferAttribute(vertexColors, 4),
    [vertexColors],
  )

  // Geometry einmal erzeugen mit den persistenten Attributen
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', positionAttr)
    geom.setAttribute('vertexColor', colorAttr)
    return geom
  }, [positionAttr, colorAttr])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  // === GPU-Ressourcen-Cleanup ===
  // useMemo allein disposed Three.js-Objekte nicht. Ohne dispose() bleiben
  // BufferGeometry + ShaderMaterial auf der GPU haengen, der Browser
  // wirft irgendwann den GL-Context weg ("Context Lost") -> React #310.
  useEffect(() => () => { geometry.dispose() }, [geometry])
  useEffect(() => () => { material.dispose() }, [material])

  useEffect(() => {
    const count = Math.min(edges.length, MAX_EDGES)

    for (let i = 0; i < count; i++) {
      const e = edges[i]
      const posOff = i * 6
      const colOff = i * 8

      positions[posOff] = e.start[0]
      positions[posOff + 1] = e.start[1]
      positions[posOff + 2] = e.start[2]
      positions[posOff + 3] = e.end[0]
      positions[posOff + 4] = e.end[1]
      positions[posOff + 5] = e.end[2]

      vertexColors[colOff] = e.color.r
      vertexColors[colOff + 1] = e.color.g
      vertexColors[colOff + 2] = e.color.b
      vertexColors[colOff + 3] = e.alpha
      vertexColors[colOff + 4] = e.color.r
      vertexColors[colOff + 5] = e.color.g
      vertexColors[colOff + 6] = e.color.b
      vertexColors[colOff + 7] = e.alpha
    }

    geometry.setDrawRange(0, count * 2)
    positionAttr.needsUpdate = true
    colorAttr.needsUpdate = true
  }, [edges, positions, vertexColors, geometry, positionAttr, colorAttr])

  return (
    <lineSegments
      frustumCulled={false}
      material={material}
      geometry={geometry}
    />
  )
}
