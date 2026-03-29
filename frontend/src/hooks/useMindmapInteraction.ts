// useMindmapInteraction — Hook für erweiterte Mindmap-Interaktionen
//
// Hover-Highlight: Maus über einen Knoten → ganzer Ast leuchtet auf,
// alle anderen Äste werden gedimmt (nur im Neural Layout)
//
// Zoom-to-Cluster: Klick auf einen Hauptast (depth 1) im Neural Layout
// → ReactFlow zoomt auf den Bereich dieses Astes
//
// Der Hook gibt Callbacks und State zurück, die MindmapPage nutzt

import { useCallback, useRef, useState } from 'react'
import type { Node, Edge, ReactFlowInstance } from 'reactflow'
import {
  getNeuralNodeStyle,
  getNeuralEdgeStyle,
} from '../utils/mindmapStyles'

// Welcher Ast ist aktuell hervorgehoben? null = keiner (alle normal)
interface InteractionState {
  highlightedBranch: number | null
}

// Alle Node-IDs sammeln, die zu einem bestimmten Ast gehören
function getNodesInBranch(nodes: Node[], branchIndex: number): Set<string> {
  const ids = new Set<string>()
  for (const node of nodes) {
    if (node.data.branchIndex === branchIndex || node.data.depth === 0) {
      ids.add(node.id)
    }
  }
  return ids
}

export function useMindmapInteraction(
  layoutMode: 'tree' | 'neural',
) {
  const [state, setState] = useState<InteractionState>({
    highlightedBranch: null,
  })

  // Referenz auf die ReactFlow-Instanz für Zoom-Steuerung
  const rfInstance = useRef<ReactFlowInstance | null>(null)

  // ReactFlow onInit-Callback — speichert die Instanz
  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance
  }, [])

  // Hover-Highlight: Maus betritt einen Knoten
  // → Setze highlightedBranch auf den branchIndex dieses Knotens
  const onNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (layoutMode !== 'neural') return
      const branch = node.data.branchIndex
      // Root-Knoten (branchIndex -1) hebt nichts hervor
      if (branch === undefined || branch < 0) return
      setState({ highlightedBranch: branch })
    },
    [layoutMode],
  )

  // Hover-Highlight: Maus verlässt einen Knoten → zurücksetzen
  const onNodeMouseLeave = useCallback(() => {
    if (layoutMode !== 'neural') return
    setState({ highlightedBranch: null })
  }, [layoutMode])

  // Zoom-to-Cluster: Klick auf einen Depth-1-Knoten im Neural Layout
  // → fitView auf alle Knoten dieses Astes
  const zoomToBranch = useCallback(
    (node: Node, allNodes: Node[]) => {
      if (layoutMode !== 'neural') return
      if (node.data.depth !== 1) return  // Nur Hauptäste
      if (!rfInstance.current) return

      const branchNodes = allNodes.filter(
        (n) => n.data.branchIndex === node.data.branchIndex,
      )
      if (branchNodes.length === 0) return

      // fitView auf die IDs dieses Astes mit etwas Padding
      rfInstance.current.fitView({
        nodes: branchNodes,
        padding: 0.4,
        duration: 600,
      })
    },
    [layoutMode],
  )

  // Styles aktualisieren basierend auf Highlight-State
  // Gibt neue Nodes/Edges zurück mit angepassten Styles
  const applyHighlight = useCallback(
    (nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } => {
      // Kein Highlight aktiv oder nicht im Neural-Modus → nichts ändern
      if (state.highlightedBranch === null || layoutMode !== 'neural') {
        return { nodes, edges }
      }

      const activeBranch = state.highlightedBranch
      const activeNodeIds = getNodesInBranch(nodes, activeBranch)

      // Knoten: Aktiver Ast normal, alle anderen gedimmt
      const updatedNodes = nodes.map((node) => {
        const isActive = activeNodeIds.has(node.id)
        return {
          ...node,
          style: getNeuralNodeStyle(
            node.data.depth,
            node.data.hasChildren,
            node.data.branchIndex < 0 ? 0 : node.data.branchIndex,
            !isActive, // dimmed = nicht im aktiven Ast
          ),
        }
      })

      // Kanten: Aktiver Ast normal, alle anderen gedimmt
      const updatedEdges = edges.map((edge) => {
        const sourceInBranch = activeNodeIds.has(edge.source)
        const targetInBranch = activeNodeIds.has(edge.target)
        const isActive = sourceInBranch && targetInBranch

        // Source-Knoten finden für Depth und branchIndex
        const sourceNode = nodes.find((n) => n.id === edge.source)
        const sourceDepth = sourceNode?.data.depth ?? 0
        const branchIdx = sourceNode?.data.branchIndex ?? 0

        return {
          ...edge,
          style: getNeuralEdgeStyle(
            sourceDepth,
            branchIdx < 0 ? 0 : branchIdx,
            !isActive,
          ),
        }
      })

      return { nodes: updatedNodes, edges: updatedEdges }
    },
    [state.highlightedBranch, layoutMode],
  )

  return {
    highlightedBranch: state.highlightedBranch,
    onInit,
    onNodeMouseEnter,
    onNodeMouseLeave,
    zoomToBranch,
    applyHighlight,
  }
}