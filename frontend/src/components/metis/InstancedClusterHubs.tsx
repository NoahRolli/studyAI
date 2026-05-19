// InstancedClusterHubs — Performance-optimierte Cluster + Folder Hubs
// Ersetzt die alte ClusterHub-Per-Component Render-Strategie
// Bei 2000+ Clustern war das alte Setup ein Render-Killer.
// Neue Architektur: drei konsolidierte Layer
//   1. Nebel-Layer: ein THREE.Points mit Custom-Shader, geteilte Texture
//   2. Klick-Layer: ein THREE.InstancedMesh, raycaster-getestet via instanceId
//   3. Label-Layer: nur Top-N Hubs (siehe ClusterLabels.tsx)

import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import ClusterLabels from './ClusterLabels'

const PARTICLES_PER_HUB = 12
const NEBULA_TEXTURE_SIZE = 128

function createSharedNebulaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = NEBULA_TEXTURE_SIZE
  canvas.height = NEBULA_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')!
  const c = NEBULA_TEXTURE_SIZE / 2
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
  grad.addColorStop(0, 'rgba(255,255,255,1.0)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.3)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, NEBULA_TEXTURE_SIZE, NEBULA_TEXTURE_SIZE)
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

const vertexShader = `
  attribute vec3 baseColor;
  attribute vec3 localOffset;
  attribute float particleSize;
  attribute float hubPhase;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float time;
  uniform float sizeMul;
  uniform float intensityMul;
  uniform float colorMul;
  uniform float pulse;
  void main() {
    vColor = baseColor * colorMul;
    
    // Original-Logik: Wolke skaliert vom Hub-Center aus (group.scale-Effekt)
    // Per-Hub-Phase macht jede Wolke eigenes Tempo aber INNERHALB einer Wolke synchron
    float breath = 1.0;
    if (pulse > 0.5) {
      breath = 1.0 + sin(time * 0.4 + hubPhase) * 0.3;
    }
    
    // Skalierter Offset vom Hub-Center
    vec3 pos = position + localOffset * breath;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = particleSize * sizeMul * (300.0 / -mvPosition.z);
    vAlpha = 0.7 * intensityMul;  // KONSTANT — kein Alpha-Flackern
  }
`

const fragmentShader = `
  uniform sampler2D nebulaTex;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 texColor = texture2D(nebulaTex, gl_PointCoord);
    gl_FragColor = vec4(vColor, texColor.a * vAlpha);
  }
`

export interface ClusterHubData {
  id: string
  position: [number, number, number]
  color: THREE.Color
  size: number
  label: string
  memberCount: number
  isFolder?: boolean
}

interface Props {
  hubs: ClusterHubData[]
  activeHubId: string | null
  showLabels: boolean
  intensityMul: number
  sizeMul: number
  colorMul: number
  pulse: boolean
  onHubClick: (id: string) => void
  isDraggingRef: React.MutableRefObject<boolean>
}

export default function InstancedClusterHubs({
  hubs, activeHubId, showLabels, intensityMul, sizeMul, colorMul, pulse,
  onHubClick, isDraggingRef,
}: Props) {
  const clickMeshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const nebulaTexture = useMemo(() => createSharedNebulaTexture(), [])

  const particleGeometry = useMemo(() => {
    const total = hubs.length * PARTICLES_PER_HUB
    const positions = new Float32Array(total * 3)       // Hub-Center (für Scale-from-Center)
    const offsets = new Float32Array(total * 3)         // Local-Offset (wird skaliert beim Pulse)
    const colors = new Float32Array(total * 3)
    const sizes = new Float32Array(total)
    const hubPhases = new Float32Array(total)
    for (let h = 0; h < hubs.length; h++) {
      const hub = hubs[h]
      const [hx, hy, hz] = hub.position
      const baseSize = hub.isFolder ? hub.size * 1.2 : hub.size
      const partScale = baseSize * 0.8
      // Eine Phase pro Hub — alle Particles synchron
      const phase = Math.random() * Math.PI * 2
      for (let p = 0; p < PARTICLES_PER_HUB; p++) {
        const i = h * PARTICLES_PER_HUB + p
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = baseSize * (0.3 + Math.random() * 1.0)
        // position = Hub-Center (alle 12 Particles des Hubs gleich)
        positions[i * 3 + 0] = hx
        positions[i * 3 + 1] = hy
        positions[i * 3 + 2] = hz
        // offset = Local-Position relativ zum Center
        offsets[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
        offsets[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        offsets[i * 3 + 2] = r * Math.cos(phi)
        colors[i * 3 + 0] = hub.color.r
        colors[i * 3 + 1] = hub.color.g
        colors[i * 3 + 2] = hub.color.b
        sizes[i] = partScale * (0.6 + Math.random() * 1.4) * 12
        hubPhases[i] = phase
      }
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('localOffset', new THREE.BufferAttribute(offsets, 3))
    geom.setAttribute('baseColor', new THREE.BufferAttribute(colors, 3))
    geom.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1))
    geom.setAttribute('hubPhase', new THREE.BufferAttribute(hubPhases, 1))
    return geom
  }, [hubs])

  const clickGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), [])
  const clickMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ visible: false }),
    [],
  )

  // === GPU-Ressourcen-Cleanup ===
  // Vier useMemo-erzeugte Three.js-Objekte haengen NICHT am JSX-Tree
  // -> R3F auto-dispose greift nicht. Ohne diese Cleanups akkumuliert
  // GPU-Memory bei jedem Hub-Update + jedem Mount/Unmount -> Context Lost.
  // particleGeometry rekreiert sich bei jedem Hub-Change ([hubs]-dep),
  // entsprechend wichtig dass die alte sauber disposed wird.
  useEffect(() => () => { nebulaTexture.dispose() }, [nebulaTexture])
  useEffect(() => () => { particleGeometry.dispose() }, [particleGeometry])
  useEffect(() => () => { clickGeometry.dispose() }, [clickGeometry])
  useEffect(() => () => { clickMaterial.dispose() }, [clickMaterial])

  useEffect(() => {
    const mesh = clickMeshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < hubs.length; i++) {
      const hub = hubs[i]
      dummy.position.set(...hub.position)
      const r = hub.isFolder ? hub.size * 1.5 : hub.size * 1.2
      dummy.scale.setScalar(r)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [hubs])

  useFrame(({ clock }) => {
    const mat = materialRef.current
    if (!mat) return
    mat.uniforms.time.value = clock.elapsedTime
    mat.uniforms.sizeMul.value = sizeMul
    mat.uniforms.intensityMul.value = intensityMul
    mat.uniforms.colorMul.value = colorMul
    mat.uniforms.pulse.value = pulse ? 1.0 : 0.0
  })

  const shaderUniforms = useMemo(() => ({
    time: { value: 0 },
    nebulaTex: { value: nebulaTexture },
    sizeMul: { value: sizeMul },
    intensityMul: { value: intensityMul },
    colorMul: { value: colorMul },
    pulse: { value: pulse ? 1.0 : 0.0 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [nebulaTexture])

  const handleClick = (event: any) => {
    if (isDraggingRef.current) return
    const id = event.instanceId
    if (typeof id !== 'number') return
    const hub = hubs[id]
    if (hub) onHubClick(hub.id)
  }

  const activeHubData = useMemo(
    () => hubs.find(h => h.id === activeHubId) || null,
    [hubs, activeHubId],
  )

  return (
    <group>
      <points geometry={particleGeometry}>
        <shaderMaterial
          ref={materialRef}
          uniforms={shaderUniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>
      <instancedMesh
        ref={clickMeshRef}
        args={[clickGeometry, clickMaterial, hubs.length]}
        onClick={handleClick}
      />
      {activeHubData && (
        <mesh position={activeHubData.position}>
          <sphereGeometry args={[
            activeHubData.isFolder ? activeHubData.size * 1.5 : activeHubData.size * 1.2,
            16, 16,
          ]} />
          <meshBasicMaterial
            color={activeHubData.color}
            wireframe
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
      {showLabels && (
        <ClusterLabels
          hubs={hubs}
          activeHubId={activeHubId}
          colorMul={colorMul}
        />
      )}
    </group>
  )
}
