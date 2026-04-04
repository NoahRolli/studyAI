// MetisSphereNodes — 3D-Bausteine für die Metis-Sphäre
// GlowNode, ClusterHub, GlowEdge, BackgroundGrid, CameraTracker
// Ausgelagert aus MetisSphere3D für 200-Zeilen-Limit

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// --- GlowNode — weisser Kern, farbiger Glow, optionales Label ---
export function GlowNode({ position, color, size, label, onClick, showLabel }: {
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  onClick?: () => void
  showLabel: boolean
  onClick?: () => void}) {
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.5 + size * 10
    if (glowRef.current) glowRef.current.scale.setScalar(1 + Math.sin(t) * 0.2)
  })

  return (
    <group position={position}>
      {/* Innerer Glow — farbig */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Kern — weiss */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={new THREE.Color('#ffffff')} />
      </mesh>
      {/* Farbiger Ring */}
      <mesh>
        <ringGeometry args={[size * 1.2, size * 1.6, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7}
          side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Label */}
      {showLabel && (
        <Html position={[size * 4, size * 1.5, 0]} style={{
          color: `#${color.getHexString()}`,
          fontSize: '11px', fontFamily: 'Orbitron, monospace',
          whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
          textShadow: `0 0 10px #${color.getHexString()}aa`,
          letterSpacing: '0.5px',
        }} distanceFactor={12}>
          {label}
        </Html>
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
  onClick?: () => void}) {
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

  return (
    <group position={position}>
      {/* Äussere Aura */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[size * 3, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.06}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Glow-Hülle */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[size * 1.8, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.2}
          depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Kern — Cluster-Farbe (nicht weiss wie bei Nodes) */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[size, 24, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Doppelter Ring */}
      <mesh>
        <ringGeometry args={[size * 2, size * 2.3, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.5}
          side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Hub-Label — grösser, bold */}
      {showLabel && (
        <Html position={[size * 5, size * 2, 0]} style={{
          color: `#${color.getHexString()}`,
          fontSize: '13px', fontFamily: 'Orbitron, monospace',
          fontWeight: 'bold', whiteSpace: 'nowrap',
          pointerEvents: 'none', userSelect: 'none',
          textShadow: `0 0 15px #${color.getHexString()}`,
          letterSpacing: '1px',
        }} distanceFactor={14}>
          {label}
        </Html>
      )}
    </group>
  )
}

// --- GlowEdge — mit optionalem Dash für Hub-Verbindungen ---
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
          color, transparent: true, opacity: 0.2 + strength * 0.3,
          depthWrite: false, blending: THREE.AdditiveBlending,
          dashSize: 0.3, gapSize: 0.2,
        })
      : new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.35 + strength * 0.55,
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
