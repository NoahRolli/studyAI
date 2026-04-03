// MetisGraph2D — 2D Knowledge-Graph mit ReactFlow
// Nodes farbig nach Typ (Grün=Note, Orange=Summary).
// Edges: WikiLinks durchgezogen gelb, AI-Edges gestrichelt grau.
// Auto-Layout via dagre, gepinnte Nodes behalten ihre Position.

import { useMemo, useCallback } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
} from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import { useLanguage } from '../../hooks/useLanguage'
import type { MetisGraph } from '../../types/metis'
import { layoutGraph } from '../../utils/metisLayout'
import MetisNode2D from './MetisNode2D'

// Farben — gedämpft, passend zum HUD-Theme
const COLORS = {
  note: '#7dd4a3',       // Grün (emerald)
  summary: '#d4a574',    // Orange
  wikilink: '#d4cc7d',   // Gelb
  ai: '#888888',         // Grau
}

interface Props {
  graph: MetisGraph
  onPositionUpdate: (id: number, x: number | null, y: number | null) => void
}

// Eigener Node-Typ registrieren
const nodeTypes = { metis: MetisNode2D }

export default function MetisGraph2D({ graph, onPositionUpdate }: Props) {
  const { t } = useLanguage()

  // Graph-Daten in ReactFlow-Format konvertieren
  const { initialNodes, initialEdges } = useMemo(() => {
    // Nodes mit Layout-Positionen berechnen
    const positioned = layoutGraph(graph)

    const rfNodes: Node[] = positioned.nodes.map(n => ({
      id: String(n.id),
      type: 'metis',
      position: { x: n.x, y: n.y },
      data: {
        label: n.title,
        nodeType: n.type,
        color: COLORS[n.type] || COLORS.note,
        pinned: n.pos_x !== null,
        connectionCount: graph.edges.filter(
          e => e.source_node_id === n.id || e.target_node_id === n.id,
        ).length,
      },
    }))

    const rfEdges: Edge[] = graph.edges.map(e => {
      const isWikilink = e.relation_type === 'wikilink'
      return {
        id: String(e.id),
        source: String(e.source_node_id),
        target: String(e.target_node_id),
        animated: !isWikilink,
        style: {
          stroke: isWikilink ? COLORS.wikilink : COLORS.ai,
          strokeWidth: isWikilink ? 2 : 1,
          strokeDasharray: isWikilink ? undefined : '5 5',
          opacity: 0.6 + e.strength * 0.4,
        },
        label: isWikilink ? '' : t.metis[
          `edge${e.relation_type.charAt(0).toUpperCase()}${e.relation_type.slice(1)}` as keyof typeof t.metis
        ] || e.relation_type,
        labelStyle: { fontSize: 10, fill: 'var(--color-text-muted)' },
      }
    })

    return { initialNodes: rfNodes, initialEdges: rfEdges }
  }, [graph, t])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // Node-Drag beendet → Position speichern (Pin)
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    const metisId = Number(node.id)
    onPositionUpdate(metisId, node.position.x, node.position.y)
  }, [onPositionUpdate])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--color-border)" gap={20} size={1} />
      <Controls
        showInteractive={false}
        style={{ bottom: 10, left: 10 }}
      />
      <MiniMap
        nodeColor={(n) => n.data?.color || '#888'}
        maskColor="rgba(0,0,0,0.5)"
        style={{ bottom: 10, right: 10 }}
      />
    </ReactFlow>
  )
}
