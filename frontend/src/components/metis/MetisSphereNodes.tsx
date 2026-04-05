// MetisSphereNodes — 3D-Bausteine für die Metis-Sphäre
// Labels via Sprite + CanvasTexture (kein DOM, rein GPU)
// GlowNode, ClusterHub, GlowEdge, BackgroundGrid, CameraTracker

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// --- Sprite-Label via CanvasTexture (kein DOM!) ---
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
    const size = fontSize || 48
    const weight = bold ? 'bold' : 'normal'
    ctx.font = `${weight} ${size}px Orbitron, monospace`
    const metrics = ctx.measureText(text)
    const w = Math.ceil(metrics.width) + 16
    const h = size + 16
    canvas.width = w
    canvas.height = h
    ctx.font = `${weight} ${size}px Orbitron, monospace`
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

// --- GlowNode — weisser Kern, farbiger Glow, Sprite-Label ---
export function GlowNode({ position, color, size, label, onClick, showLabel }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  onClick?: () => void
  showLabel: boolean
}) {
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.5 + size * 10
    if (glowRef.current) glowRef.current.scale.setScalar(1 + Math.sin(t) * 0.2)
  })

  const hex = `#${color.getHexString()}`

  return (
    <group position={position}>
      {/* Innerer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.06}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Kern */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[size, 8, 8]} />
        <meshBasicMaterial color={new THREE.Color('#ffffff')} />
      </mesh>
      {/* Sprite-Label */}
      {showLabel && (
        <SpriteLabel
          position={[size * 3, size * 1.5, 0]}
          text={label} color={hex} />
      )}
    </group>
  )
}

// --- ClusterHub — Nebel/Wolken-Cluster statt solider Kugel ---
export function ClusterHub({ position, color, size, label, showLabel, onClick }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  showLabel: boolean
  onClick?: () => void
}) {
  const layerRefs = useRef<THREE.Mesh[]>([])

  // Nebel-Schichten: verschiedene Grössen, Offsets, Geschwindigkeiten
  const layers = useMemo(() => [
    { scale: 1.0, speed: 0.4, opacity: 0.12, offset: [0, 0, 0] },
    { scale: 1.4, speed: 0.25, opacity: 0.07, offset: [0.3, -0.2, 0.1] },
    { scale: 1.8, speed: 0.15, opacity: 0.04, offset: [-0.2, 0.3, -0.2] },
    { scale: 2.3, speed: 0.1, opacity: 0.025, offset: [0.1, -0.1, 0.3] },
  ], [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    layerRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const l = layers[i]
      const pulse = 1 + Math.sin(t * l.speed + i * 1.5) * 0.15
      mesh.scale.setScalar(l.scale * pulse)
      // Leichte Drift-Bewegung für Nebel-Effekt
      const drift = 0.3
      mesh.position.set(
        l.offset[0] + Math.sin(t * l.speed * 0.7 + i) * drift,
        l.offset[1] + Math.cos(t * l.speed * 0.5 + i * 2) * drift,
        l.offset[2] + Math.sin(t * l.speed * 0.3 + i * 3) * drift,
      )
    })
  })

  const hex = `#${color.getHexString()}`

  return (
    <group position={position}>
      {/* Nebel-Schichten */}
      {layers.map((l, i) => (
        <mesh key={i}
          ref={el => { if (el) layerRefs.current[i] = el }}
          position={l.offset as [number, number, number]}>
          <sphereGeometry args={[size * l.scale, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={l.opacity}
            depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      {/* Unsichtbarer Klick-Bereich */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[size * 1.2, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {/* Sprite-Label */}
      {showLabel && (
        <SpriteLabel
          position={[size * 4, size * 2, 0]}
          text={label} color={hex} fontSize={56} bold />
      )}
    </group>
  )
}
// --- GlowEdge ---
export function GlowEdge({ start, end, color, strength, dashed }: {
  start: [number, number, number]
  end: [number, number, number]
  color: THREE.Color
  strength: number
  dashed?: boolean
}) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start), new THREE.Vector3(...end),
    ])
    const mat = dashed
      ? new THREE.LineDashedMaterial({
          color, transparent: true, opacity: 0.05 + strength * 0.1,
          depthWrite: false, blending: THREE.AdditiveBlending,
          dashSize: 0.3, gapSize: 0.2,
        })
      : new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.07 + strength * 0.12,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })
    const l = new THREE.Line(geo, mat)
    if (dashed) l.computeLineDistances()
    return l
  }, [start, end, color, strength, dashed])
  return <primitive object={line} />
}

// --- BackgroundGrid ---
export function BackgroundGrid() {
  const lines = useMemo(() => {
    const group = new THREE.Group()
    const s = 50, step = 2.5
    const mat = new THREE.LineBasicMaterial({
      color: '#1a4050', transparent: true, opacity: 0.5, depthWrite: false,
    })
    for (let i = -s; i <= s; i += step) {
      const h = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-s, i, -0.1), new THREE.Vector3(s, i, -0.1),
      ])
      const v = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i, -s, -0.1), new THREE.Vector3(i, s, -0.1),
      ])
      group.add(new THREE.Line(h, mat), new THREE.Line(v, mat))
    }
    return group
  }, [])
  return <primitive object={lines} position={[0, 0, -15]} />
}

// --- CameraTracker ---
export function CameraTracker({ onCameraMove }: {
  onCameraMove: (a: number, e: number, d: number) => void
}) {
  const { camera } = useThree()
  useFrame(() => {
    const p = camera.position, d = p.length()
    onCameraMove(
      Math.atan2(p.x, p.z) * (180 / Math.PI),
      Math.asin(p.y / d) * (180 / Math.PI), d,
    )
  })
  return null
}
