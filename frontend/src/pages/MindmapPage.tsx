// MindmapPage — Fullscreen Mindmap-Ansicht mit React Flow
// Zeigt eine interaktive Mindmap basierend auf einer AI-Zusammenfassung
// Route: /mindmap/:summaryId
//
// Flow: Backend liefert Baumstruktur → wir wandeln sie in
// React Flow Nodes + Edges um → interaktive Darstellung
//
// Deep Dive: Klick auf einen Knoten ohne Kinder → AI generiert Unterknoten

import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Node, Edge } from 'reactflow'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { get, post } from '../hooks/useAPI'

// --- Typen ---

// Baumstruktur wie sie vom Backend kommt
interface MindmapTreeNode {
  id: number
  label: string
  detail: string
  depth_level: number
  position_x: number
  position_y: number
  children: MindmapTreeNode[]
}

// API-Antworten
interface MindmapResponse {
  summary_id: number
  tree: MindmapTreeNode[]
}

interface ExpandResponse {
  node_id: number
  children: MindmapTreeNode[]
}

// --- Hilfsfunktionen ---

// Farben je nach Tiefenstufe
function getNodeColor(depth: number): string {
  const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
  return colors[depth % colors.length]
}

// Baumstruktur → React Flow Nodes + Edges umwandeln
// Positioniert Knoten automatisch in einer horizontalen Baumstruktur
function treeToFlow(
  treeNodes: MindmapTreeNode[],
  parentId?: string,
  startX: number = 0,
  startY: number = 0,
  horizontalGap: number = 280,
  verticalGap: number = 100,
): { nodes: Node[]; edges: Edge[]; totalHeight: number } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let currentY = startY

  for (const treeNode of treeNodes) {
    const nodeId = `node-${treeNode.id}`

    // Kinder zuerst berechnen um die vertikale Position zu zentrieren
    let childResult = { nodes: [] as Node[], edges: [] as Edge[], totalHeight: 0 }
    if (treeNode.children.length > 0) {
      childResult = treeToFlow(
        treeNode.children,
        nodeId,
        startX + horizontalGap,
        currentY,
        horizontalGap,
        verticalGap,
      )
    }

    // Eigene Y-Position: zentriert über den Kindern, oder einfach currentY
    const nodeHeight = treeNode.children.length > 0
      ? currentY + childResult.totalHeight / 2
      : currentY

    // React Flow Node erstellen
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
      style: {
        background: getNodeColor(treeNode.depth_level),
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 16px',
        fontSize: treeNode.depth_level === 0 ? '14px' : '12px',
        fontWeight: treeNode.depth_level === 0 ? 'bold' : 'normal',
        maxWidth: '200px',
        cursor: 'pointer',
      },
    })

    // Edge zum Elternknoten
    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        style: { stroke: '#4b5563', strokeWidth: 2 },
        animated: false,
      })
    }

    // Kind-Nodes und Edges hinzufügen
    nodes.push(...childResult.nodes)
    edges.push(...childResult.edges)

    // Y-Position für nächsten Geschwister-Knoten
    const usedHeight = treeNode.children.length > 0
      ? childResult.totalHeight
      : verticalGap
    currentY += usedHeight
  }

  return {
    nodes,
    edges,
    totalHeight: currentY - startY,
  }
}

// --- Komponente ---

function MindmapPage() {
  const { summaryId } = useParams<{ summaryId: string }>()

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // UI State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanding, setExpanding] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

  // Originale Baumdaten speichern (für Rebuild nach Deep Dive)
  const [treeData, setTreeData] = useState<MindmapTreeNode[]>([])

  // --- Mindmap laden oder generieren ---

  async function loadMindmap() {
    try {
      setLoading(true)
      setError(null)

      let data: MindmapResponse

      try {
        // Zuerst versuchen ob schon eine Mindmap existiert
        data = await get<MindmapResponse>(`/api/summaries/${summaryId}/mindmap`)
      } catch {
        // Falls nicht: neue Mindmap generieren
        data = await post<MindmapResponse>(`/api/summaries/${summaryId}/mindmap`)
      }

      setTreeData(data.tree)

      // Baum in React Flow Nodes/Edges umwandeln
      const { nodes: flowNodes, edges: flowEdges } = treeToFlow(data.tree)
      setNodes(flowNodes)
      setEdges(flowEdges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mindmap konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (summaryId) loadMindmap()
  }, [summaryId])

  // --- Deep Dive: Knoten expandieren ---

  const onNodeClick = useCallback(async (_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)

    // Nur expandieren wenn der Knoten keine Kinder hat
    if (node.data.hasChildren) return

    try {
      setExpanding(true)
      setError(null)

      const data = await post<ExpandResponse>(
        `/api/mindmap/nodes/${node.data.backendId}/expand`
      )

      // Neue Kinder in den Baum einfügen
      function insertChildren(
        treeNodes: MindmapTreeNode[],
        targetId: number,
        children: MindmapTreeNode[],
      ): MindmapTreeNode[] {
        return treeNodes.map((n) => {
          if (n.id === targetId) {
            return { ...n, children }
          }
          if (n.children.length > 0) {
            return { ...n, children: insertChildren(n.children, targetId, children) }
          }
          return n
        })
      }

      // Lokale Kinder-Daten aufbereiten (Backend gibt keine IDs zurück)
      // Wir nutzen temporäre IDs basierend auf dem Zeitstempel
      const childrenWithIds: MindmapTreeNode[] = data.children.map((c, i) => ({
        id: Date.now() + i,
        label: c.label || '',
        detail: c.detail || '',
        depth_level: node.data.depth + 1,
        position_x: 0,
        position_y: 0,
        children: [],
      }))

      const updatedTree = insertChildren(treeData, node.data.backendId, childrenWithIds)
      setTreeData(updatedTree)

      // Komplett neu rendern
      const { nodes: flowNodes, edges: flowEdges } = treeToFlow(updatedTree)
      setNodes(flowNodes)
      setEdges(flowEdges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deep Dive fehlgeschlagen')
    } finally {
      setExpanding(false)
    }
  }, [treeData, setNodes, setEdges])

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Mindmap wird generiert...</p>
          <p className="text-gray-600 text-sm mt-2">Das kann einige Sekunden dauern.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Zurück
          </Link>
          <h1 className="text-lg font-semibold">Mindmap</h1>
        </div>

        {/* Status-Anzeigen */}
        <div className="flex items-center gap-3">
          {expanding && (
            <span className="text-sm text-blue-400">Wird erweitert...</span>
          )}
          {selectedNode && (
            <span className="text-xs text-gray-500">
              Ausgewählt: {selectedNode.data.label}
            </span>
          )}
        </div>
      </div>

      {/* Fehlermeldung */}
      {error && (
        <div className="mx-6 mt-3 bg-red-900/30 border border-red-800 text-red-300 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* React Flow Mindmap */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
        >
          <Controls
            position="bottom-left"
            style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          />
          <MiniMap
            position="bottom-right"
            nodeColor={(node) => getNodeColor(node.data?.depth ?? 0)}
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
          />
          <Background variant={BackgroundVariant.Dots} color="#374151" gap={20} />
        </ReactFlow>
      </div>

      {/* Detail-Panel — zeigt Detail-Text des ausgewählten Knotens */}
      {selectedNode && selectedNode.data.detail && (
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">
            {selectedNode.data.label}
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            {selectedNode.data.detail}
          </p>
        </div>
      )}
    </div>
  )
}

export default MindmapPage