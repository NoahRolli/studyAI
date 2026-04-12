// OntologyEgoGraph — Node-zentrierte Ansicht (Ego-Graph)
// Zeigt gewaehlten Node zentral + alle verbundenen Nodes radial
// Klick auf verbundenen Node wechselt den Fokus
// Alle Daten kommen aus /api/relations (concept_edges)

import { useState, useEffect, useCallback, useMemo } from 'react'
import ReactFlow, { Background } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import { getOntologyMarker } from '../../utils/ontologyMarkers'
import type { RelationData } from '../../types/relations'

// Ontology-Farben
const TYPE_COLORS: Record<string, string> = {
  is_a: '#ff6b9d', subclass_of: '#c084fc', part_of: '#fb923c',
  builds_on: '#4ade80', requires: '#f87171', contradicts: '#ef4444',
  example_of: '#67e8f9', related_to: '#a78bfa',
}

interface EgoNode {
  key: string; label: string; id: number
}

interface EgoEdge {
  sourceKey: string; targetKey: string
  relType: string; relLabel: string
  origin: string
}

interface Props {
  focusKey: string | null
  onFocusChange: (key: string) => void
}

export default function OntologyEgoGraph({ focusKey, onFocusChange }: Props) {
  const { language } = useLanguage()
  const [relations, setRelations] = useState<RelationData[]>([])
  const [loading, setLoading] = useState(true)

  // Alle nicht-rejected Relations laden
  useEffect(() => {
    get<RelationData[]>('/api/relations')
      .then(rels => setRelations(rels.filter(r => r.status !== 'rejected')))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Alle Nodes + Edges aufbauen
  const { egoNodes, egoEdges, allNodes } = useMemo(() => {
    const nodeMap = new Map<string, EgoNode>()
    const edges: EgoEdge[] = []

    relations.forEach(r => {
      const sKey = `concept:${r.source_id}`
      const tKey = `concept:${r.target_id}`
      if (!nodeMap.has(sKey)) nodeMap.set(sKey, {
        key: sKey, label: r.source_title || `#${r.source_id}`, id: r.source_id,
      })
      if (!nodeMap.has(tKey)) nodeMap.set(tKey, {
        key: tKey, label: r.target_title || `#${r.target_id}`, id: r.target_id,
      })
      edges.push({
        sourceKey: sKey, targetKey: tKey,
        relType: r.relation_type?.name || 'related_to',
        relLabel: language === 'de'
          ? (r.relation_type?.label_de || '?')
          : (r.relation_type?.label_en || '?'),
        origin: r.origin || 'manual',
      })
    })

    return { egoNodes: nodeMap, egoEdges: edges, allNodes: Array.from(nodeMap.values()) }
  }, [relations, language])

  // Fokus-Node bestimmen
  const focus = focusKey || (allNodes.length > 0 ? allNodes[0].key : null)

  // Nachbar-Nodes + Edges fuer Fokus filtern
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!focus) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }

    const neighbors = new Set<string>()
    const relevantEdges: EgoEdge[] = []
    egoEdges.forEach(e => {
      if (e.sourceKey === focus) { neighbors.add(e.targetKey); relevantEdges.push(e) }
      else if (e.targetKey === focus) { neighbors.add(e.sourceKey); relevantEdges.push(e) }
    })

    const centerNode = egoNodes.get(focus)
    if (!centerNode) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] }

    const nodes: Node[] = [{
      id: focus,
      position: { x: 300, y: 300 },
      data: { label: centerNode.label },
      style: {
        background: '#00d4ff', color: '#0a0e17',
        fontWeight: 'bold', fontSize: '13px',
        border: '2px solid #00d4ff', borderRadius: '8px',
        padding: '8px 14px', boxShadow: '0 0 12px #00d4ff60',
      },
    }]

    // Nachbarn radial anordnen
    const neighborArr = Array.from(neighbors)
    neighborArr.forEach((nKey, i) => {
      const n = egoNodes.get(nKey)
      if (!n) return
      const angle = (2 * Math.PI * i) / neighborArr.length - Math.PI / 2
      const radius = 200
      nodes.push({
        id: nKey,
        position: { x: 300 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius },
        data: { label: n.label },
        style: {
          background: 'var(--color-bg-surface)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px', padding: '6px 10px',
          fontSize: '11px', cursor: 'pointer',
        },
      })
    })

    // Edges
    const edges: Edge[] = relevantEdges.map((e, i) => {
      const marker = getOntologyMarker(e.relType)
      const color = TYPE_COLORS[e.relType] || '#a78bfa'
      return {
        id: `ego-${i}`,
        source: e.sourceKey, target: e.targetKey,
        label: marker ? `${marker.symbol} ${e.relLabel}` : e.relLabel,
        labelStyle: { fill: color, fontSize: '10px' },
        style: { stroke: color, strokeWidth: e.origin === 'manual' ? 2 : 1.5 },
        animated: e.origin !== 'manual',
      }
    })

    return { rfNodes: nodes, rfEdges: edges }
  }, [focus, egoNodes, egoEdges])

  // Node-Klick → Fokus wechseln
  const onNodeClick = useCallback((_: any, node: Node) => {
    if (node.id !== focus) onFocusChange(node.id)
  }, [focus, onFocusChange])

  if (loading) {
    return <div className="text-xs p-4" style={{ color: 'var(--color-text-muted)' }}>
      {language === 'de' ? 'Laden...' : 'Loading...'}
    </div>
  }

  if (allNodes.length === 0) {
    return <div className="hud-card p-8 text-center">
      <p style={{ color: 'var(--color-text-muted)' }}>
        {language === 'de' ? 'Keine Verbindungen vorhanden.' : 'No connections found.'}
      </p>
    </div>
  }

  return (
    <div>
      {/* Node-Auswahl */}
      <div className="flex gap-3 mb-4 items-center">
        <select value={focus || ''} onChange={e => onFocusChange(e.target.value)}
          className="hud-input text-xs">
          {allNodes.map(n => (
            <option key={n.key} value={n.key}>{n.label}</option>
          ))}
        </select>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {rfEdges.length} {language === 'de' ? 'Verbindungen' : 'connections'}
        </span>
      </div>

      {/* ReactFlow Graph */}
      <div style={{ height: '500px', borderRadius: '8px', overflow: 'hidden',
        border: '1px solid var(--color-border)' }}>
        <ReactFlow
          nodes={rfNodes} edges={rfEdges}
          onNodeClick={onNodeClick}
          fitView fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}>
          <Background color="var(--color-border)" gap={20} />
        </ReactFlow>
      </div>
    </div>
  )
}
