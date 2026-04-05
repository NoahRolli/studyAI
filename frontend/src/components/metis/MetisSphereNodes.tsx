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
export function GlowNode({ position, color, size, label, onClick, showLabel,
  glowMul = 1, colorMul = 1 }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  onClick?: () => void
  showLabel: boolean
  glowMul?: number
  colorMul?: number
}) {
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.5 + size * 10
    if (glowRef.current) glowRef.current.scale.setScalar(1 + Math.sin(t) * 0.2)
  })

  const scaledColor = color.clone().multiplyScalar(colorMul)
  const hex = `#${scaledColor.getHexString()}`

  return (
    <group position={position}>
      {/* Innerer Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2, 8, 8]} />
        <meshBasicMaterial color={scaledColor} transparent opacity={0.06 * glowMul}
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

// --- Nebel-Textur via Canvas (weicher Gauss-Punkt) ---
function createNebulaTexture(color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const cx = 64, cy = 64
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 64)
  grad.addColorStop(0, color + 'ff')
  grad.addColorStop(0.3, color + 'aa')
  grad.addColorStop(0.6, color + '55')
  grad.addColorStop(1, color + '00')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

// --- ClusterHub — Weltraum-Nebel aus Sprite-Partikeln ---
export function ClusterHub({ position, color, size, label, showLabel, onClick,
  intensityMul = 1, sizeMul = 1, colorMul = 1 }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  showLabel: boolean
  onClick?: () => void
  intensityMul?: number
  sizeMul?: number
  colorMul?: number
}) {
  const groupRef = useRef<THREE.Group>(null)

  // Nebel-Partikel generieren (zufällige Positionen + Grössen)
  const particles = useMemo(() => {
    const hex = '#' + color.getHexString()
    const tex = createNebulaTexture(hex)
    const count = Math.min(12 + Math.floor(size * 4), 30)
    const pts: { sprite: THREE.Sprite; basePos: number[]; speed: number; baseScale: number }[] = []
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true,
        opacity: 0.7 + Math.random() * 0.3,
        depthWrite: false, blending: THREE.NormalBlending,
      })
      const sprite = new THREE.Sprite(mat)
      // Zufällige Position im Kugelvolumen
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = size * (0.3 + Math.random() * 1.2)
      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta)
      const z = r * Math.cos(phi)
      sprite.position.set(x, y, z)
      const s = size * (0.8 + Math.random() * 1.5)
      sprite.scale.set(s, s, 1)
      pts.push({ sprite, basePos: [x, y, z], speed: 0.1 + Math.random() * 0.3, baseScale: s })
    }
    return pts
  }, [color, size])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    particles.forEach((p, i) => {
      const drift = size * 0.15
      p.sprite.position.set(
        p.basePos[0] + Math.sin(t * p.speed + i * 1.7) * drift,
        p.basePos[1] + Math.cos(t * p.speed * 0.8 + i * 2.3) * drift,
        p.basePos[2] + Math.sin(t * p.speed * 0.6 + i * 3.1) * drift,
      )
      // Live-Grösse via sizeMul
      const s = p.baseScale * sizeMul
      p.sprite.scale.set(s, s, 1)
      // Pulsieren der Opazität via intensityMul
      const mat = p.sprite.material as THREE.SpriteMaterial
      mat.opacity = ((0.7 + Math.random() * 0.05) + Math.sin(t * p.speed + i) * 0.12) * intensityMul
      mat.color.copy(color).multiplyScalar(colorMul)
    })
  })

  const hex = `#${color.getHexString()}`

  return (
    <group position={position} ref={groupRef}>
      {/* Nebel-Partikel */}
      {particles.map((p, i) => (
        <primitive key={i} object={p.sprite} />
      ))}
      {/* Unsichtbarer Klick-Bereich */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[size * 1.5, 8, 8]} />
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
