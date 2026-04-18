// JournalEgoGraph — Ego-zentrierte 2D-Ansicht des Journal-Metis-Graphen
// Zeigt Fokus-Node zentral + alle direkt verbundenen Nachbarn radial
// Klick auf Nachbar wechselt den Fokus + propagiert über onNodeClick (nur ID)
// Reine Visualisierung — Daten kommen via Props vom übergeordneten Tab

import { useState, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, { Background } from 'reactflow'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import 'reactflow/dist/style.css'
import { useLanguage } from '../../hooks/useLanguage'
import type { MetisGraph, MetisNode } from '../../types/metis'

// Edge-Status-Farben (matcht das Strength/Confirmed-Schema)
const STATUS_COLORS: Record<string, string> = {
  confirmed: 'var(--color-primary)',
  suggested: 'var(--color-text-muted)',
}

interface Props {
  graph: MetisGraph
  selectedNode: MetisNode | null
  onNodeClick: (nodeId: number) => void
}

export default function JournalEgoGraph({ graph, selectedNode, onNodeClick }: Props) {
  const { language } = useLanguage()

  // Lokaler Fokus — initialisiert mit selectedNode oder erstem verfügbaren Node
  const [focusId, setFocusId] = useState<number | null>(
    selectedNode?.id ?? graph.nodes[0]?.id ?? null
  )

  // Sync mit externem selectedNode (z.B. wenn Sphäre Selection ändert)
  useEffect(() => {
    if (selectedNode && selectedNode.id !== focusId) {
      setFocusId(selectedNode.id)
    }
  }, [selectedNode, focusId])

  // Aktiver Fokus-Node
  const focusNode = useMemo(
    () => graph.nodes.find(n => n.id === focusId) ?? graph.nodes[0] ?? null,
    [graph.nodes, focusId]
  )

  // Nachbar-Nodes via Edges sammeln (rejected wird ignoriert)
  const neighbors = useMemo(() => {
    if (!focusNode) return []
    const ids = new Set<number>()
    for (const e of graph.edges) {
      if (e.status === 'rejected') continue
      if (e.source_node_id === focusNode.id) ids.add(e.target_node_id)
      else if (e.target_node_id === focusNode.id) ids.add(e.source_node_id)
    }
    return graph.nodes.filter(n => ids.has(n.id))
  }, [focusNode, graph.edges, graph.nodes])

  // ReactFlow-Nodes: Zentrum + Kreis um Zentrum (IDs werden für RF zu String)
  const rfNodes: RFNode[] = useMemo(() => {
    if (!focusNode) return []
    const out: RFNode[] = [{
      id: String(focusNode.id),
      data: { label: focusNode.title },
      position: { x: 0, y: 0 },
      style: {
        background: 'var(--color-primary)',
        color: 'var(--color-bg)',
        border: '2px solid var(--color-primary)',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 12px',
      },
    }]
    const radius = 220
    const count = Math.max(neighbors.length, 1)
    neighbors.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      out.push({
        id: String(n.id),
        data: { label: n.title },
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        style: {
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          fontSize: 11,
          padding: '4px 10px',
        },
      })
    })
    return out
  }, [focusNode, neighbors])

  // ReactFlow-Edges: nur Edges die Fokus betreffen (IDs als String für RF)
  const rfEdges: RFEdge[] = useMemo(() => {
    if (!focusNode) return []
    return graph.edges
      .filter(e => e.status !== 'rejected' && (e.source_node_id === focusNode.id || e.target_node_id === focusNode.id))
      .map(e => {
        const status = e.status || 'suggested'
        const color = STATUS_COLORS[status] || 'var(--color-text-muted)'
        return {
          id: String(e.id),
          source: String(e.source_node_id),
          target: String(e.target_node_id),
          style: { stroke: color, strokeWidth: 1 + (e.strength ?? 0.5) * 2 },
          animated: status === 'suggested',
        }
      })
  }, [focusNode, graph.edges])

  // Klick auf Node — Fokus wechseln + ID nach oben propagieren
  const handleClick = useCallback((_: unknown, node: RFNode) => {
    const numId = Number(node.id)
    const target = graph.nodes.find(n => n.id === numId)
    if (!target) return
    setFocusId(target.id)
    onNodeClick(target.id)
  }, [graph.nodes, onNodeClick])

  if (!focusNode) {
    return (
      <div className="hud-card p-6 text-center">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Keine Daten — synchronisiere zuerst.' : 'No data — sync first.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header: Fokus-Selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Fokus' : 'Focus'}:
        </span>
        <select
          value={focusNode.id}
          onChange={(e) => setFocusId(Number(e.target.value))}
          className="hud-input text-xs flex-1 max-w-xs"
        >
          {graph.nodes.map(n => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {neighbors.length} {language === 'de' ? 'Verbindungen' : 'connections'}
        </span>
      </div>

      {/* ReactFlow Graph */}
      <div style={{
        height: '500px', borderRadius: '8px', overflow: 'hidden',
        border: '1px solid var(--color-border)',
      }}>
        <ReactFlow
          nodes={rfNodes} edges={rfEdges}
          onNodeClick={handleClick}
          fitView fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--color-border)" gap={20} />
        </ReactFlow>
      </div>
    </div>
  )
}
