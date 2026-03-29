// Mindmap Layout-Algorithmen
//
// 1. Tree-Layout: Horizontale Baumstruktur, geordnet, übersichtlich
// 2. Neural-Layout: Radial mit Ast-basierten Sektoren
//    — Jeder Hauptast bekommt einen eigenen Winkelbereich
//    — Kinder werden innerhalb des Eltern-Sektors platziert
//    — Dynamischer Radius passt sich an Knotenanzahl an
//
// Styles und Farben kommen aus mindmapStyles.ts

import type { Node, Edge } from 'reactflow'
import {
  type MindmapTreeNode,
  getNodeStyle,
  getEdgeStyle,
  getNeuralNodeStyle,
  getNeuralEdgeStyle,
} from './mindmapStyles'

// Re-Export damit bestehende Imports weiter funktionieren
export type { MindmapTreeNode }
export { getNodeStyle, getEdgeStyle, getNeuralNodeStyle, getNeuralEdgeStyle }

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
// Layout 2: Neural (radial, Ast-basierte Sektoren)
// ============================================

// Hilfsfunktion: Zählt alle Knoten in einem Teilbaum
function countNodes(node: MindmapTreeNode): number {
  let count = 1
  for (const child of node.children) count += countNodes(child)
  return count
}

// Deterministischer Pseudo-Zufall basierend auf Knoten-ID
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

// Rekursive Platzierung: Knoten innerhalb ihres Sektors positionieren
function placeNodesInSector(
  node: MindmapTreeNode,
  parentId: string | null,
  parentDepth: number,
  branchIndex: number,
  centerX: number,
  centerY: number,
  sectorStart: number,
  sectorEnd: number,
  radius: number,
  radiusStep: number,
  nodes: Node[],
  edges: Edge[],
): void {
  const nodeId = `node-${node.id}`
  const depth = node.depth_level
  const sectorMid = (sectorStart + sectorEnd) / 2

  // Leichter Jitter für organisches Feeling (5% des Radius)
  const jitterR = (seededRandom(node.id * 3) - 0.5) * radius * 0.05
  const jitterA = (seededRandom(node.id * 7) - 0.5) * 0.08
  const x = centerX + Math.cos(sectorMid + jitterA) * (radius + jitterR)
  const y = centerY + Math.sin(sectorMid + jitterA) * (radius + jitterR)

  nodes.push({
    id: nodeId,
    position: { x, y },
    data: {
      label: node.label,
      detail: node.detail,
      depth,
      backendId: node.id,
      hasChildren: node.children.length > 0,
      branchIndex,
    },
    style: getNeuralNodeStyle(depth, node.children.length > 0, branchIndex),
  })

  if (parentId) {
    edges.push({
      id: `edge-${parentId}-${nodeId}`,
      source: parentId,
      target: nodeId,
      style: getNeuralEdgeStyle(parentDepth, branchIndex),
      animated: true,
      type: 'default',
    })
  }

  // Kinder rekursiv — Sektor aufteilen nach Teilbaumgrösse
  if (node.children.length > 0) {
    const childRadius = radius + radiusStep
    const sectorWidth = sectorEnd - sectorStart
    const childWeights = node.children.map((c) => countNodes(c))
    const totalWeight = childWeights.reduce((sum, w) => sum + w, 0)

    let currentAngle = sectorStart
    for (let i = 0; i < node.children.length; i++) {
      const childWidth = (childWeights[i] / totalWeight) * sectorWidth
      placeNodesInSector(
        node.children[i], nodeId, depth, branchIndex,
        centerX, centerY,
        currentAngle, currentAngle + childWidth,
        childRadius, radiusStep, nodes, edges,
      )
      currentAngle += childWidth
    }
  }
}

export function neuralLayout(
  treeNodes: MindmapTreeNode[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  if (treeNodes.length === 0) return { nodes, edges }

  const centerX = 600
  const centerY = 500
  const root = treeNodes[0]
  const rootId = `node-${root.id}`

  // Root im Zentrum
  nodes.push({
    id: rootId,
    position: { x: centerX, y: centerY },
    data: {
      label: root.label, detail: root.detail, depth: 0,
      backendId: root.id, hasChildren: root.children.length > 0,
      branchIndex: -1,
    },
    style: getNeuralNodeStyle(0, root.children.length > 0, 0),
  })

  const branches = root.children
  if (branches.length === 0) return { nodes, edges }

  // Dynamischer Radius — mehr Äste = grösserer Kreis
  const baseRadius = Math.max(280, 200 + branches.length * 30)
  const totalNodes = countNodes(root)
  const radiusStep = Math.max(160, 120 + Math.sqrt(totalNodes) * 10)

  // Gewichtete Sektor-Aufteilung pro Ast
  const weights = branches.map((b) => countNodes(b))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  let angle = 0

  for (let i = 0; i < branches.length; i++) {
    const sectorWidth = (weights[i] / totalWeight) * 2 * Math.PI
    placeNodesInSector(
      branches[i], rootId, 0, i,
      centerX, centerY,
      angle, angle + sectorWidth,
      baseRadius, radiusStep, nodes, edges,
    )
    angle += sectorWidth
  }

  return { nodes, edges }
}