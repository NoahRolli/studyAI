// Mindmap Layout-Algorithmen
// Zwei Darstellungsoptionen für die React Flow Mindmap:
//
// 1. Tree-Layout: Horizontale Baumstruktur, geordnet, übersichtlich
// 2. Neural-Layout: Radial/organisch, wie ein neuronales Netz
//    Knoten werden kreisförmig um den Kern angeordnet
//    Zufällige Offsets sorgen für organische, gehirnartige Ästhetik
//
// Beide Layouts geben React Flow Nodes + Edges zurück

import type { Node, Edge } from 'reactflow'

// --- Typen ---

// Baumstruktur wie sie vom Backend kommt
export interface MindmapTreeNode {
  id: number
  label: string
  detail: string
  depth_level: number
  position_x: number
  position_y: number
  children: MindmapTreeNode[]
}

// --- Shared: Knoten-Styling ---

// Glow-Intensität nimmt mit Tiefe ab
export function getNodeStyle(depth: number, hasChildren: boolean): React.CSSProperties {
  const opacity = Math.max(0.6, 1 - depth * 0.15)
  const glowSize = Math.max(8, 20 - depth * 4)
  const fontSize = depth === 0 ? '13px' : depth === 1 ? '11px' : '10px'

  return {
    background: `rgba(0, 212, 255, ${0.08 + depth * 0.02})`,
    border: `1px solid rgba(0, 212, 255, ${0.3 * opacity})`,
    borderRadius: depth === 0 ? '50%' : '12px',
    padding: depth === 0 ? '20px' : '10px 16px',
    color: `rgba(0, 212, 255, ${opacity})`,
    fontSize,
    fontFamily: depth === 0 ? "'Orbitron', monospace" : "'Inter', sans-serif",
    fontWeight: depth === 0 ? '600' : depth === 1 ? '500' : '400',
    letterSpacing: depth === 0 ? '0.08em' : '0',
    textTransform: depth === 0 ? 'uppercase' as const : 'none' as const,
    maxWidth: depth === 0 ? '160px' : '180px',
    textAlign: 'center' as const,
    cursor: hasChildren ? 'default' : 'pointer',
    boxShadow: `0 0 ${glowSize}px rgba(0, 212, 255, ${0.15 * opacity}), inset 0 0 ${glowSize / 2}px rgba(0, 212, 255, ${0.05 * opacity})`,
    backdropFilter: 'blur(8px)',
    transition: 'all 0.3s ease',
  }
}

// Neural-Layout: Runde Knoten für organisches Gefühl
function getNeuralNodeStyle(depth: number, hasChildren: boolean): React.CSSProperties {
  const opacity = Math.max(0.6, 1 - depth * 0.12)
  const glowSize = Math.max(10, 25 - depth * 4)
  const fontSize = depth === 0 ? '12px' : depth === 1 ? '10px' : '9px'

  return {
    background: `radial-gradient(circle, rgba(0, 212, 255, ${0.12 + depth * 0.02}), rgba(0, 212, 255, ${0.04}))`,
    border: `1px solid rgba(0, 212, 255, ${0.35 * opacity})`,
    borderRadius: '50%',
    padding: depth === 0 ? '24px 18px' : depth === 1 ? '16px 14px' : '12px 10px',
    color: `rgba(0, 212, 255, ${opacity})`,
    fontSize,
    fontFamily: depth === 0 ? "'Orbitron', monospace" : "'Inter', sans-serif",
    fontWeight: depth === 0 ? '600' : '400',
    letterSpacing: depth === 0 ? '0.06em' : '0',
    textTransform: depth === 0 ? 'uppercase' as const : 'none' as const,
    maxWidth: depth === 0 ? '140px' : '120px',
    minWidth: depth === 0 ? '140px' : depth === 1 ? '100px' : '80px',
    minHeight: depth === 0 ? '140px' : depth === 1 ? '100px' : '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    cursor: hasChildren ? 'default' : 'pointer',
    boxShadow: `0 0 ${glowSize}px rgba(0, 212, 255, ${0.2 * opacity}), 0 0 ${glowSize * 2}px rgba(0, 212, 255, ${0.06 * opacity})`,
    backdropFilter: 'blur(10px)',
    transition: 'all 0.4s ease',
  }
}

// Kanten-Style für beide Layouts
export function getEdgeStyle(sourceDepth: number): React.CSSProperties {
  const opacity = Math.max(0.2, 0.5 - sourceDepth * 0.1)
  return {
    stroke: `rgba(0, 212, 255, ${opacity})`,
    strokeWidth: Math.max(1, 2.5 - sourceDepth * 0.5),
    filter: `drop-shadow(0 0 4px rgba(0, 212, 255, ${opacity * 0.6}))`,
  }
}

// Neural Kanten — dünner, organischer
function getNeuralEdgeStyle(sourceDepth: number): React.CSSProperties {
  const opacity = Math.max(0.15, 0.4 - sourceDepth * 0.08)
  return {
    stroke: `rgba(0, 212, 255, ${opacity})`,
    strokeWidth: Math.max(0.8, 2 - sourceDepth * 0.4),
    filter: `drop-shadow(0 0 6px rgba(0, 212, 255, ${opacity * 0.8}))`,
  }
}

// ============================================
// Layout 1: Tree (horizontale Baumstruktur)
// ============================================

export function treeLayout(
  treeNodes: MindmapTreeNode[],
  parentId?: string,
  parentDepth: number = 0,
  startX: number = 0,
  startY: number = 0,
  horizontalGap: number = 300,
  verticalGap: number = 90,
): { nodes: Node[]; edges: Edge[]; totalHeight: number } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let currentY = startY

  for (const treeNode of treeNodes) {
    const nodeId = `node-${treeNode.id}`

    // Kinder zuerst berechnen für vertikale Zentrierung
    let childResult = { nodes: [] as Node[], edges: [] as Edge[], totalHeight: 0 }
    if (treeNode.children.length > 0) {
      childResult = treeLayout(
        treeNode.children,
        nodeId,
        treeNode.depth_level,
        startX + horizontalGap,
        currentY,
        horizontalGap,
        verticalGap,
      )
    }

    const nodeHeight = treeNode.children.length > 0
      ? currentY + childResult.totalHeight / 2
      : currentY

    nodes.push({
      id: nodeId,
      position: { x: startX, y: nodeHeight },
      data: {
        label: treeNode.label,
        detail: treeNode.detail,
        depth: treeNode.depth_level,
        backendId: treeNode.id,
        hasChildren: treeNode.children.length > 0,
      },
      style: getNodeStyle(treeNode.depth_level, treeNode.children.length > 0),
    })

    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        style: getEdgeStyle(parentDepth),
        animated: true,
        type: 'smoothstep',
      })
    }

    nodes.push(...childResult.nodes)
    edges.push(...childResult.edges)

    const usedHeight = treeNode.children.length > 0
      ? childResult.totalHeight
      : verticalGap
    currentY += usedHeight
  }

  return { nodes, edges, totalHeight: currentY - startY }
}

// ============================================
// Layout 2: Neural (radial, organisch)
// ============================================

// Sammelt alle Knoten flach mit Parent-Referenz
interface FlatNode {
  treeNode: MindmapTreeNode
  parentId: string | null
  parentDepth: number
}

function flattenTree(
  treeNodes: MindmapTreeNode[],
  parentId: string | null = null,
  parentDepth: number = 0,
): FlatNode[] {
  const flat: FlatNode[] = []
  for (const node of treeNodes) {
    flat.push({ treeNode: node, parentId, parentDepth })
    if (node.children.length > 0) {
      flat.push(...flattenTree(node.children, `node-${node.id}`, node.depth_level))
    }
  }
  return flat
}

// Seeded Random — reproduzierbare "Zufallswerte" basierend auf Knoten-ID
// Sorgt dafür dass das Layout bei jedem Rendern gleich aussieht
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

export function neuralLayout(
  treeNodes: MindmapTreeNode[],
): { nodes: Node[]; edges: Edge[] } {
  const flatNodes = flattenTree(treeNodes)
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Zentrum der Darstellung
  const centerX = 600
  const centerY = 500

  // Gruppiere Knoten nach Tiefe
  const byDepth: Map<number, FlatNode[]> = new Map()
  for (const fn of flatNodes) {
    const depth = fn.treeNode.depth_level
    if (!byDepth.has(depth)) byDepth.set(depth, [])
    byDepth.get(depth)!.push(fn)
  }

  // Positioniere Knoten radial: jede Tiefe auf einem eigenen Ring
  // Radius wächst mit Tiefe, Knoten verteilen sich gleichmässig auf dem Ring
  for (const [depth, group] of byDepth) {
    const radius = depth === 0 ? 0 : 180 + (depth - 1) * 160
    const angleStep = (2 * Math.PI) / Math.max(group.length, 1)
    // Startwinkel leicht versetzt pro Tiefe für organisches Gefühl
    const angleOffset = depth * 0.4

    for (let i = 0; i < group.length; i++) {
      const fn = group[i]
      const nodeId = `node-${fn.treeNode.id}`
      const angle = angleOffset + i * angleStep

      // Zufälliger Offset für organische Positionierung
      const jitterX = (seededRandom(fn.treeNode.id * 3) - 0.5) * radius * 0.25
      const jitterY = (seededRandom(fn.treeNode.id * 7) - 0.5) * radius * 0.25

      const x = centerX + Math.cos(angle) * radius + jitterX
      const y = centerY + Math.sin(angle) * radius + jitterY

      nodes.push({
        id: nodeId,
        position: { x, y },
        data: {
          label: fn.treeNode.label,
          detail: fn.treeNode.detail,
          depth: fn.treeNode.depth_level,
          backendId: fn.treeNode.id,
          hasChildren: fn.treeNode.children.length > 0,
        },
        style: getNeuralNodeStyle(depth, fn.treeNode.children.length > 0),
      })

      // Edge zum Elternknoten
      if (fn.parentId) {
        edges.push({
          id: `edge-${fn.parentId}-${nodeId}`,
          source: fn.parentId,
          target: nodeId,
          style: getNeuralEdgeStyle(fn.parentDepth),
          animated: true,
          type: 'default',
        })
      }
    }
  }

  return { nodes, edges }
}