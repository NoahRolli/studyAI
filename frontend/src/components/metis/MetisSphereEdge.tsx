// MetisSphereEdge — 3D-Edge mit optionalem Ontologie-Symbol + Label
// GlowEdge: Linie zwischen Nodes, Ontology-Edges mit Glow-Halo
// EdgeMarker: Symbol, EdgeLabel: Typ-Text am Mittelpunkt

import { useMemo } from 'react'
import * as THREE from 'three'
import { getOntologyMarker } from '../../utils/ontologyMarkers'

// --- Sprite-Symbol am Edge-Mittelpunkt ---
function EdgeMarker({ mid, relationType }: {
  mid: [number, number, number]; relationType: string
}) {
  const sprite = useMemo(() => {
    const marker = getOntologyMarker(relationType)
    if (!marker) return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const size = 64
    canvas.width = size; canvas.height = size
    ctx.font = `bold ${size * 0.7}px monospace`
    ctx.fillStyle = marker.color
    ctx.shadowColor = marker.color; ctx.shadowBlur = 10
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(marker.symbol, size / 2, size / 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const mat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const s = new THREE.Sprite(mat)
    s.scale.set(1.2, 1.2, 1)
    return s
  }, [relationType])
  if (!sprite) return null
  return <primitive object={sprite} position={mid} />
}

// --- Sprite-Label am Edge-Mittelpunkt (Typ-Name) ---
function EdgeLabel({ mid, text, color }: {
  mid: [number, number, number]; text: string; color: string
}) {
  const sprite = useMemo(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const fontSize = 32
    ctx.font = `${fontSize}px Orbitron, monospace`
    const metrics = ctx.measureText(text)
    const w = Math.ceil(metrics.width) + 12
    const h = fontSize + 8
    canvas.width = w; canvas.height = h
    ctx.font = `${fontSize}px Orbitron, monospace`
    ctx.fillStyle = color
    ctx.shadowColor = color; ctx.shadowBlur = 6
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 6, h / 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const mat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false,
      opacity: 0.7,
    })
    const s = new THREE.Sprite(mat)
    s.scale.set(w / 100, h / 100, 1)
    return s
  }, [text, color])
  // Leicht versetzt damit Symbol und Label nicht überlappen
  const offset: [number, number, number] = [mid[0], mid[1] + 0.8, mid[2]]
  return <primitive object={sprite} position={offset} />
}

// --- GlowEdge — Leuchtende Verbindungslinie ---
export function GlowEdge({ start, end, color, strength, dashed, status,
  relationType, showMarker, showLabel, thickness }: {
  start: [number, number, number]
  end: [number, number, number]
  color: THREE.Color
  strength: number
  dashed?: boolean
  status?: string
  relationType?: string
  showMarker?: boolean
  showLabel?: boolean
  thickness?: number
}) {
  const isOntology = thickness && thickness > 1
  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2,
  ]

  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start), new THREE.Vector3(...end),
    ])
    const isConfirmed = status === 'confirmed'
    const opBase = isConfirmed ? 0.15 : 0.05
    const opScale = isConfirmed ? 0.2 : 0.1
    const mat = dashed
      ? new THREE.LineDashedMaterial({
          color, transparent: true, opacity: opBase + strength * opScale,
          depthWrite: false, blending: THREE.AdditiveBlending,
          dashSize: 0.3, gapSize: 0.2,
        })
      : new THREE.LineBasicMaterial({
          color, transparent: true, opacity: opBase + strength * opScale,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
    const l = new THREE.Line(geo, mat)
    if (dashed) l.computeLineDistances()
    return l
  }, [start, end, color, strength, dashed, status])

  // Glow-Halo für Ontology (breiter, halbtransparent)
  const glow = useMemo(() => {
    if (!isOntology) return null
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start), new THREE.Vector3(...end),
    ])
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true,
      opacity: 0.08 * (thickness || 1),
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    return new THREE.Line(geo, mat)
  }, [start, end, color, isOntology, thickness])

  const marker = getOntologyMarker(relationType || '')

  return (
    <group>
      <primitive object={line} />
      {glow && <primitive object={glow} />}
      {showMarker && relationType && (
        <EdgeMarker mid={mid} relationType={relationType} />
      )}
      {showLabel && relationType && marker && (
        <EdgeLabel mid={mid} text={relationType} color={marker.color} />
      )}
    </group>
  )
}
