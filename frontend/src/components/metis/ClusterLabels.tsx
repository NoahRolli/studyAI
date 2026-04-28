// ClusterLabels — Sprite-Labels für Cluster + Folder Hubs
// Renderingstrategie: nicht alle 2000+ Cluster bekommen Labels (das war
// der Killer im alten Setup). Stattdessen:
//   - Alle Folder-Hubs bekommen permanent ein Label
//   - Top-N grösste Cluster bekommen permanent ein Label
//   - Aktiver/geklickter Hub bekommt ein Label dynamisch zusätzlich
// Die SpriteLabel-Subkomponente baut eine CanvasTexture pro Label.
// Bei TOP_N=30 sind das ~30-50 Texturen statt 2338 — vernachlässigbar.

import { useMemo } from 'react'
import * as THREE from 'three'
import type { ClusterHubData } from './InstancedClusterHubs'

const TOP_N_LABELS = 30

interface Props {
  hubs: ClusterHubData[]
  activeHubId: string | null
  colorMul: number
}

export default function ClusterLabels({ hubs, activeHubId, colorMul }: Props) {
  const visibleHubs = useMemo(() => {
    const folders = hubs.filter(h => h.isFolder)
    const clusters = hubs.filter(h => !h.isFolder)
    const sorted = [...clusters].sort((a, b) => b.memberCount - a.memberCount)
    const topN = sorted.slice(0, TOP_N_LABELS)
    const active = activeHubId
      ? hubs.find(h => h.id === activeHubId && !topN.includes(h) && !folders.includes(h))
      : null
    return [...folders, ...topN, ...(active ? [active] : [])]
  }, [hubs, activeHubId])

  return (
    <>
      {visibleHubs.map(hub => (
        <SpriteLabel
          key={hub.id}
          position={[
            hub.position[0] + hub.size * 1.5,
            hub.position[1] + hub.size * 1.0,
            hub.position[2],
          ]}
          text={hub.label}
          color={`#${hub.color.clone().multiplyScalar(colorMul).getHexString()}`}
          fontSize={hub.isFolder ? 40 : 28}
          bold={hub.isFolder}
        />
      ))}
    </>
  )
}

function SpriteLabel({ position, text, color, fontSize, bold }: {
  position: [number, number, number]
  text: string
  color: string
  fontSize?: number
  bold?: boolean
}) {
  const sprite = useMemo(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const size = fontSize || 32
    const weight = bold ? 'bold' : 'normal'
    ctx.font = `${weight} ${size}px Inter, -apple-system, sans-serif`
    const metrics = ctx.measureText(text)
    const w = Math.ceil(metrics.width) + 16
    const h = size + 16
    canvas.width = w
    canvas.height = h
    ctx.font = `${weight} ${size}px Inter, -apple-system, sans-serif`
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 8, h / 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const mat = new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false,
    })
    const s = new THREE.Sprite(mat)
    s.scale.set(w / 80, h / 80, 1)
    return s
  }, [text, color, fontSize, bold])

  return <primitive object={sprite} position={position} />
}
