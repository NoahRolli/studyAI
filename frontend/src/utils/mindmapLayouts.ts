// Mindmap Layout-Algorithmen
//
// Tree-Layout: Horizontale Baumstruktur, geordnet, übersichtlich
// Styles und Farben kommen aus mindmapStyles.ts

import type { Node, Edge } from 'reactflow'
import {
  type MindmapTreeNode,
  getNodeStyle,
  getEdgeStyle,
} from './mindmapStyles'

// Re-Export damit bestehende Imports weiter funktionieren
export type { MindmapTreeNode }
export { getNodeStyle, getEdgeStyle }

// ============================================
// Tree-Layout (horizontale Baumstruktur)
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
