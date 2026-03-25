// MindmapPage — Fullscreen Mindmap im neuronalen Netz-Style
// Zeigt eine interaktive Mindmap basierend auf einer AI-Zusammenfassung
// Route: /mindmap/:summaryId
//
// Design: Glühende Knoten mit Cyan-Glow, animierte Kanten,
// dunkler Hintergrund mit Dot-Grid, neuronales Netz-Ästhetik
//
// Flow: Backend liefert Baumstruktur → React Flow Nodes + Edges
// Deep Dive: Klick auf Blatt-Knoten → AI generiert Unterknoten

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

// Knoten-Styling nach Tiefe — Glow-Intensität nimmt mit Tiefe ab
function getNodeStyle(depth: number, hasChildren: boolean): React.CSSProperties {
  // Basisfarbe: Cyan, wird mit Tiefe dunkler
  const opacity = Math.max(0.6, 1 - depth * 0.15)
  const glowSize = Math.max(8, 20 - depth * 4)
  const fontSize = depth === 0 ? '13px' : depth === 1 ? '11px' : '10px'

  return {
    background: `rgba(0, 212, 255, ${0.08 + depth * 0.02})`,
    border: `1px solid rgba(0, 212, 255, ${0.3 * opacity})`,
    borderRadius: '12px',
    padding: depth === 0 ? '14px 20px' : '10px 16px',
    color: `rgba(0, 212, 255, ${opacity})`,
    fontSize,
    fontFamily: depth === 0 ? "'Orbitron', monospace" : "'Inter', sans-serif",
    fontWeight: depth === 0 ? '600' : depth === 1 ? '500' : '400',
    letterSpacing: depth === 0 ? '0.08em' : '0',
    textTransform: depth === 0 ? 'uppercase' as const : 'none' as const,
    maxWidth: depth === 0 ? '240px' : '200px',
    textAlign: 'center' as const,
    cursor: hasChildren ? 'default' : 'pointer',
    boxShadow: `0 0 ${glowSize}px rgba(0, 212, 255, ${0.15 * opacity}), inset 0 0 ${glowSize / 2}px rgba(0, 212, 255, ${0.05 * opacity})`,
    backdropFilter: 'blur(8px)',
    transition: 'all 0.3s ease',
  }
}

// Kanten-Style — glühende Linien
function getEdgeStyle(sourceDepth: number): React.CSSProperties {
  const opacity = Math.max(0.2, 0.5 - sourceDepth * 0.1)
  return {
    stroke: `rgba(0, 212, 255, ${opacity})`,
    strokeWidth: Math.max(1, 2.5 - sourceDepth * 0.5),
    filter: `drop-shadow(0 0 4px rgba(0, 212, 255, ${opacity * 0.6}))`,
  }
}

// Baumstruktur → React Flow Nodes + Edges
// Positioniert Knoten in einer horizontalen Baumstruktur
function treeToFlow(
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

    // Kinder zuerst berechnen um die vertikale Position zu zentrieren
    let childResult = { nodes: [] as Node[], edges: [] as Edge[], totalHeight: 0 }
    if (treeNode.children.length > 0) {
      childResult = treeToFlow(
        treeNode.children,
        nodeId,
        treeNode.depth_level,
        startX + horizontalGap,
        currentY,
        horizontalGap,
        verticalGap,
      )
    }

    // Y-Position: zentriert über den Kindern
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
      style: getNodeStyle(treeNode.depth_level, treeNode.children.length > 0),
    })

    // Edge zum Elternknoten — glühende Cyan-Linie
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

    // Kind-Nodes und Edges hinzufügen
    nodes.push(...childResult.nodes)
    edges.push(...childResult.edges)

    // Y-Position für nächsten Geschwister-Knoten
    const usedHeight = treeNode.children.length > 0
      ? childResult.totalHeight
      : verticalGap
    currentY += usedHeight
  }

  return { nodes, edges, totalHeight: currentY - startY }
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

  // Originale Baumdaten (für Rebuild nach Deep Dive)
  const [treeData, setTreeData] = useState<MindmapTreeNode[]>([])

  // --- Mindmap laden oder generieren ---
  async function loadMindmap() {
    try {
      setLoading(true)
      setError(null)
      let data: MindmapResponse
      try {
        data = await get<MindmapResponse>(`/api/summaries/${summaryId}/mindmap`)
      } catch {
        data = await post<MindmapResponse>(`/api/summaries/${summaryId}/mindmap`)
      }
      setTreeData(data.tree)
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
          if (n.id === targetId) return { ...n, children }
          if (n.children.length > 0) {
            return { ...n, children: insertChildren(n.children, targetId, children) }
          }
          return n
        })
      }

      // Temporäre IDs für neue Kinder
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

  // Ladebildschirm
  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: 'var(--color-bg-deep)' }}
      >
        <div className="text-center animate-fade-in">
          <p className="hud-title text-sm text-glow mb-2">Mindmap wird generiert</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Neuronales Netz wird aufgebaut...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg-deep)' }}>
      {/* Header — HUD-Style */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{
          backgroundColor: 'var(--color-bg-base)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-xs transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ← Zurück
          </Link>
          <h1 className="hud-title text-sm text-glow">Mindmap</h1>
        </div>
        <div className="flex items-center gap-3">
          {expanding && (
            <span className="text-xs animate-glow-pulse" style={{ color: 'var(--color-primary)' }}>
              Wird erweitert...
            </span>
          )}
          {selectedNode && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {selectedNode.data.label}
            </span>
          )}
        </div>
      </div>

      {/* Fehlermeldung */}
      {error && (
        <div
          className="mx-6 mt-3 px-4 py-2 rounded-lg text-sm border"
          style={{
            background: 'rgba(255, 59, 92, 0.1)',
            borderColor: 'rgba(255, 59, 92, 0.3)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      {/* React Flow — Neuronales Netz Darstellung */}
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
          style={{ backgroundColor: 'var(--color-bg-deep)' }}
        >
          {/* Controls — passend zum HUD-Theme */}
          <Controls
            position="bottom-left"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              boxShadow: '0 0 15px rgba(0, 212, 255, 0.1)',
            }}
          />
          {/* MiniMap — Cyan-Töne */}
          <MiniMap
            position="bottom-right"
            nodeColor={() => 'rgba(0, 212, 255, 0.6)'}
            maskColor="rgba(10, 14, 23, 0.8)"
            style={{
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
            }}
          />
          {/* Hintergrund — subtile Punkte */}
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(0, 212, 255, 0.1)"
            gap={25}
            size={1}
          />
        </ReactFlow>
      </div>

      {/* Detail-Panel — zeigt Details des ausgewählten Knotens */}
      {selectedNode && selectedNode.data.detail && (
        <div
          className="px-6 py-4 border-t"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>
            {selectedNode.data.label}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {selectedNode.data.detail}
          </p>
        </div>
      )}
    </div>
  )
}

export default MindmapPage