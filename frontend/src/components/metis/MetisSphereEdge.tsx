// MetisSphereEdge — 3D-Edge mit optionalem Ontologie-Symbol
// GlowEdge: Linie zwischen Nodes (Similarity/Ontology/Cluster)
// EdgeMarker: Sprite-Symbol am Mittelpunkt für Ontologie-Typen

import { useMemo } from 'react'
import * as THREE from 'three'
import { getOntologyMarker } from '../../utils/ontologyMarkers'

// --- Sprite-Symbol am Edge-Mittelpunkt ---
function EdgeMarker({ start, end, relationType }: {
  start: [number, number, number]
  end: [number, number, number]
  relationType: string
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
    ctx.shadowColor = marker.color
    ctx.shadowBlur = 10
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
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

  // Mittelpunkt der Edge
  const midpoint: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ]

  return <primitive object={sprite} position={midpoint} />
}

// --- GlowEdge — Leuchtende Verbindungslinie ---
export function GlowEdge({ start, end, color, strength, dashed, status,
  relationType, showMarker }: {
  start: [number, number, number]
  end: [number, number, number]
  color: THREE.Color
  strength: number
  dashed?: boolean
  status?: string
  relationType?: string
  showMarker?: boolean
}) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start), new THREE.Vector3(...end),
    ])
    // Confirmed: solider + heller, Suggested: halbtransparent
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

  return (
    <group>
      <primitive object={line} />
      {showMarker && relationType && (
        <EdgeMarker start={start} end={end} relationType={relationType} />
      )}
    </group>
  )
}
