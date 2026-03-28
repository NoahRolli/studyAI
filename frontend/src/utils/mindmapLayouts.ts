// Mindmap Layout-Algorithmen
// Zwei Darstellungsoptionen für die React Flow Mindmap:
//
// 1. Tree-Layout: Horizontale Baumstruktur, geordnet, übersichtlich
// 2. Neural-Layout: Radial/organisch, wie ein neuronales Netz
//
// Jeder Hauptast (depth 1) bekommt eine eigene Farbe
// Kinder erben die Farbe ihres Astes für visuelle Zugehörigkeit

import type { Node, Edge } from 'reactflow'

// --- Typen ---

export interface MindmapTreeNode {
  id: number
  label: string
  detail: string
  depth_level: number
  position_x: number
  position_y: number
  children: MindmapTreeNode[]
}

// --- Farbpalette für Äste ---
// Jeder Hauptast (Index 0-7) bekommt eine eigene Akzentfarbe
// Kinder erben die Farbe über branchIndex

const BRANCH_COLORS = [
  { r: 0, g: 212, b: 255 },   // Cyan (Original)
  { r: 168, g: 85, b: 247 },  // Violett
  { r: 52, g: 211, b: 153 },  // Smaragd
  { r: 251, g: 146, b: 60 },  // Orange
  { r: 244, g: 114, b: 182 }, // Pink
  { r: 250, g: 204, b: 21 },  // Gelb
  { r: 56, g: 189, b: 248 },  // Himmelblau
  { r: 163, g: 230, b: 53 },  // Lime
]

function getBranchColor(branchIndex: number) {
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]
}

function rgba(c: { r: number; g: number; b: number }, a: number) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`
}

// --- Tree-Layout Knoten-Style mit Ast-Farbe ---

export function getNodeStyle(
  depth: number,
  hasChildren: boolean,
  branchIndex: number = 0,
): React.CSSProperties {
  // Root-Knoten (depth 0) bleibt immer Cyan
  const color = depth === 0
    ? BRANCH_COLORS[0]
    : getBranchColor(branchIndex)

  const opacity = Math.max(0.6, 1 - depth * 0.15)
  const glowSize = Math.max(8, 20 - depth * 4)
  const fontSize = depth === 0 ? '13px' : depth === 1 ? '11px' : '10px'

  return {
    background: rgba(color, 0.08 + depth * 0.02),
    border: `1px solid ${rgba(color, 0.3 * opacity)}`,
    borderRadius: depth === 0 ? '50%' : '12px',
    padding: depth === 0 ? '20px' : '10px 16px',
    color: rgba(color, opacity),
    fontSize,
    fontFamily: depth === 0
      ? "var(--font-heading)"
      : "var(--font-body)",
    fontWeight: depth === 0 ? '600' : depth === 1 ? '500' : '400',
    letterSpacing: depth === 0 ? '0.08em' : '0',
    textTransform: depth === 0 ? 'uppercase' as const : 'none' as const,
    maxWidth: depth === 0 ? '160px' : '180px',
    textAlign: 'center' as const,
    cursor: hasChildren ? 'default' : 'pointer',
    boxShadow: `0 0 ${glowSize}px ${rgba(color, 0.15 * opacity)}`,
    backdropFilter: 'blur(8px)',
    transition: 'all 0.3s ease',
  }
}

// --- Neural-Layout Knoten-Style ---

function getNeuralNodeStyle(
  depth: number,
  hasChildren: boolean,
  branchIndex: number = 0,
): React.CSSProperties {
  const color = depth === 0
    ? BRANCH_COLORS[0]
    : getBranchColor(branchIndex)

  const opacity = Math.max(0.6, 1 - depth * 0.12)
  const glowSize = Math.max(10, 25 - depth * 4)
  const fontSize = depth === 0 ? '12px' : depth === 1 ? '10px' : '9px'

  return {
    background: `radial-gradient(circle, ${rgba(color, 0.12 + depth * 0.02)}, ${rgba(color, 0.04)})`,
    border: `1px solid ${rgba(color, 0.35 * opacity)}`,
    borderRadius: '50%',
    padding: depth === 0 ? '24px 18px' : depth === 1 ? '16px 14px' : '12px 10px',
    color: rgba(color, opacity),
    fontSize,
    fontFamily: depth === 0
      ? "var(--font-heading)"
      : "var(--font-body)",
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
    boxShadow: `0 0 ${glowSize}px ${rgba(color, 0.2 * opacity)}`,
    backdropFilter: 'blur(10px)',
    transition: 'all 0.4s ease',
  }
}

// --- Kanten-Styles ---

export function getEdgeStyle(
  sourceDepth: number,
  branchIndex: number = 0,
): React.CSSProperties {
  const color = sourceDepth === 0
    ? BRANCH_COLORS[0]
    : getBranchColor(branchIndex)

  const opacity = Math.max(0.2, 0.5 - sourceDepth * 0.1)
  return {
    stroke: rgba(color, opacity),
    strokeWidth: Math.max(1, 2.5 - sourceDepth * 0.5),
    filter: `drop-shadow(0 0 4px ${rgba(color, opacity * 0.6)})`,
  }
}

function getNeuralEdgeStyle(
  sourceDepth: number,
  branchIndex: number = 0,
): React.CSSProperties {
  const color = sourceDepth === 0
    ? BRANCH_COLORS[0]
    : getBranchColor(branchIndex)

  const opacity = Math.max(0.15, 0.4 - sourceDepth * 0.08)
  return {
    stroke: rgba(color, opacity),
    strokeWidth: Math.max(0.8, 2 - sourceDepth * 0.4),
    filter: `drop-shadow(0 0 6px ${rgba(color, opacity * 0.8)})`,
  }
}

// ============================================
// Layout 1: Tree (horizontale Baumstruktur)
// branchIndex wird beim ersten Kind-Level vergeben und weitervererbt
// ============================================

export function treeLayout(
  treeNodes: MindmapTreeNode[],
  parentId?: string,
  parentDepth: number = 0,
  startX: number = 0,
  startY: number = 0,
  horizontalGap: number = 300,
  verticalGap: number = 90,
  branchIndex: number = 0,
): { nodes: Node[]; edges: Edge[]; totalHeight: number } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let currentY = startY

  for (let i = 0; i < treeNodes.length; i++) {
    const treeNode = treeNodes[i]
    const nodeId = `node-${treeNode.id}`

    // Ast-Index: Root-Kinder bekommen eigene Farbe (i),
    // tiefere Knoten erben den branchIndex vom Eltern
    const currentBranch = parentDepth === 0 ? i : branchIndex

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
        currentBranch,
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
        branchIndex: currentBranch,
      },
      style: getNodeStyle(treeNode.depth_level, treeNode.children.length > 0, currentBranch),
    })

    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        style: getEdgeStyle(parentDepth, currentBranch),
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

interface FlatNode {
  treeNode: MindmapTreeNode
  parentId: string | null
  parentDepth: number
  branchIndex: number
}

function flattenTree(
  treeNodes: MindmapTreeNode[],
  parentId: string | null = null,
  parentDepth: number = 0,
  branchIndex: number = 0,
): FlatNode[] {
  const flat: FlatNode[] = []
  for (let i = 0; i < treeNodes.length; i++) {
    const node = treeNodes[i]
    // Ast-Index: Root-Kinder bekommen eigene Farbe
    const currentBranch = parentDepth === 0 ? i : branchIndex
    flat.push({ treeNode: node, parentId, parentDepth, branchIndex: currentBranch })
    if (node.children.length > 0) {
      flat.push(
        ...flattenTree(node.children, `node-${node.id}`, node.depth_level, currentBranch),
      )
    }
  }
  return flat
}

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

  const centerX = 600
  const centerY = 500

  // Gruppiere Knoten nach Tiefe
  const byDepth: Map<number, FlatNode[]> = new Map()
  for (const fn of flatNodes) {
    const depth = fn.treeNode.depth_level
    if (!byDepth.has(depth)) byDepth.set(depth, [])
    byDepth.get(depth)!.push(fn)
  }

  for (const [depth, group] of byDepth) {
    const radius = depth === 0 ? 0 : 180 + (depth - 1) * 160
    const angleStep = (2 * Math.PI) / Math.max(group.length, 1)
    const angleOffset = depth * 0.4

    for (let i = 0; i < group.length; i++) {
      const fn = group[i]
      const nodeId = `node-${fn.treeNode.id}`
      const angle = angleOffset + i * angleStep

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
          branchIndex: fn.branchIndex,
        },
        style: getNeuralNodeStyle(depth, fn.treeNode.children.length > 0, fn.branchIndex),
      })

      if (fn.parentId) {
        edges.push({
          id: `edge-${fn.parentId}-${nodeId}`,
          source: fn.parentId,
          target: nodeId,
          style: getNeuralEdgeStyle(fn.parentDepth, fn.branchIndex),
          animated: true,
          type: 'default',
        })
      }
    }
  }

  return { nodes, edges }
}