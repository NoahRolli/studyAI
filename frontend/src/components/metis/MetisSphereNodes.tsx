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
      {/* Ring */}
      <mesh>
        <ringGeometry args={[size * 1.2, size * 1.6, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2}
          side={THREE.DoubleSide} depthWrite={false} />
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

// --- ClusterHub — grosser zentraler Knotenpunkt pro Cluster ---
export function ClusterHub({ position, color, size, label, showLabel, onClick }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  showLabel: boolean
  onClick?: () => void
}) {
  const outerRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.8
    if (outerRef.current) {
      outerRef.current.scale.setScalar(1 + Math.sin(t) * 0.15)
    }
    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.2)
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.06 + Math.sin(t * 0.5) * 0.03
    }
  })

  const hex = `#${color.getHexString()}`

  return (
    <group position={position}>
      {/* Äussere Aura */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[size * 3, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.06}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Glow-Hülle */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[size * 1.8, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.2}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Kern — klickbar */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Doppelter Ring */}
      <mesh>
        <ringGeometry args={[size * 2, size * 2.3, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.5}
          side={THREE.DoubleSide} depthWrite={false} />
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
