// MetisGraph2D — 2D Knowledge-Graph mit ReactFlow
// Nodes als leuchtende Dots (Grün=Note, Orange=Summary).
// Edges: WikiLinks durchgezogen gelb, AI-Edges gestrichelt grau.
// Klick auf Node öffnet Detail-Panel, Drag speichert Position.

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

// Farben — gedämpft, HUD-Stil
const COLORS: Record<string, string> = {
  note: '#7dd4a3', summary: '#d4a574',
  wikilink: '#d4cc7d', ai: '#888888', entry: '#00d4ff',
  is_a: '#ff6b9d', subclass_of: '#c084fc', part_of: '#fb923c',
  builds_on: '#4ade80', requires: '#f87171', contradicts: '#ef4444',
  example_of: '#67e8f9', related_to: '#a78bfa',
}

interface Props {
  graph: MetisGraph
  onPositionUpdate: (id: number, x: number | null, y: number | null) => void
  onNodeClick: (nodeId: number) => void
  transparent?: boolean
}

// Eigener Node-Typ
const nodeTypes = { metis: MetisNode2D }

export default function MetisGraph2D({ graph, onPositionUpdate, onNodeClick, transparent }: Props) {
  const { t } = useLanguage()

  // Graph-Daten in ReactFlow-Format
  const { initialNodes, initialEdges } = useMemo(() => {
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
      const isOntology = e.id < 0
      const edgeColor = COLORS[e.relation_type] || COLORS.ai
      return {
        id: String(e.id),
        source: String(e.source_node_id),
        target: String(e.target_node_id),
        animated: !isWikilink && !isOntology,
        style: {
          stroke: edgeColor,
          strokeWidth: isOntology ? 2.5 : (isWikilink ? 2.5 : 1.5),
          strokeDasharray: (isWikilink || isOntology) ? undefined : '6 4',
          opacity: isOntology ? 0.8 : (0.5 + e.strength * 0.5),
          filter: `drop-shadow(0 0 3px ${edgeColor}60)`,
        },
      }
    })

    return { initialNodes: rfNodes, initialEdges: rfEdges }
  }, [graph, t])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // Node-Drag → Position speichern
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    onPositionUpdate(Number(node.id), node.position.x, node.position.y)
  }, [onPositionUpdate])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={(_: unknown, node: Node) => onNodeClick(Number(node.id))}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.4 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      {!transparent && <Background color="#3a7080" gap={25} size={1} />}
      <Controls
        showInteractive={false}
        className="metis-controls"
      />
      <MiniMap
        nodeColor={(n) => n.data?.color || '#888'}
        maskColor="rgba(0, 0, 0, 0.6)"
        className="metis-minimap"
        style={{
          backgroundColor: 'var(--color-bg-deep)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      />
    </ReactFlow>
  )
}
