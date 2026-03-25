// MindmapPage — Fullscreen Mindmap mit zwei Darstellungsoptionen
// Route: /mindmap/:summaryId
//
// Layouts (umschaltbar):
// 1. Tree — horizontale Baumstruktur, geordnet
// 2. Neural — radial, organisch, wie ein neuronales Netz
//
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
import {
  treeLayout,
  neuralLayout,
  type MindmapTreeNode,
} from '../utils/mindmapLayouts'

// API-Antworten
interface MindmapResponse {
  summary_id: number
  tree: MindmapTreeNode[]
}

interface ExpandResponse {
  node_id: number
  children: MindmapTreeNode[]
}

// Verfügbare Layout-Modi
type LayoutMode = 'tree' | 'neural'

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

  // Layout-Modus (Standard: Tree)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('tree')

  // Originale Baumdaten (für Rebuild nach Layout-Wechsel oder Deep Dive)
  const [treeData, setTreeData] = useState<MindmapTreeNode[]>([])

  // --- Layout anwenden ---
  // Wandelt die Baumdaten je nach Modus in React Flow Nodes/Edges um
  function applyLayout(tree: MindmapTreeNode[], mode: LayoutMode) {
    if (mode === 'neural') {
      const { nodes: n, edges: e } = neuralLayout(tree)
      setNodes(n)
      setEdges(e)
    } else {
      const { nodes: n, edges: e } = treeLayout(tree)
      setNodes(n)
      setEdges(e)
    }
  }

  // --- Layout wechseln ---
  function switchLayout(mode: LayoutMode) {
    setLayoutMode(mode)
    if (treeData.length > 0) {
      applyLayout(treeData, mode)
    }
  }

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
      applyLayout(data.tree, layoutMode)
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
      applyLayout(updatedTree, layoutMode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deep Dive fehlgeschlagen')
    } finally {
      setExpanding(false)
    }
  }, [treeData, layoutMode, setNodes, setEdges])

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
      {/* Header */}
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

        <div className="flex items-center gap-4">
          {/* Layout-Switch */}
          <div
            className="flex gap-1 p-1 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-surface)' }}
          >
            <button
              onClick={() => switchLayout('tree')}
              className={`hud-tab ${layoutMode === 'tree' ? 'hud-tab-active' : ''}`}
            >
              Tree
            </button>
            <button
              onClick={() => switchLayout('neural')}
              className={`hud-tab ${layoutMode === 'neural' ? 'hud-tab-active' : ''}`}
            >
              Neural
            </button>
          </div>

          {/* Status */}
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
          style={{ backgroundColor: 'var(--color-bg-deep)' }}
        >
          <Controls
            position="bottom-left"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              boxShadow: '0 0 15px rgba(0, 212, 255, 0.1)',
            }}
          />
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
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(0, 212, 255, 0.1)"
            gap={25}
            size={1}
          />
        </ReactFlow>
      </div>

      {/* Detail-Panel */}
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