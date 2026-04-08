// MindmapPage — Fullscreen Mindmap mit Tree-Layout
// Route: /mindmap/:summaryId
// Doppelklick: Deep Dive — AI generiert Unterknoten

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Node } from 'reactflow'
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
import { useLanguage } from '../hooks/useLanguage'
import { useMindmapDeepDive } from '../hooks/useMindmapDeepDive'
import {
  treeLayout,
  type MindmapTreeNode,
} from '../utils/mindmapLayouts'

interface MindmapResponse {
  summary_id: number
  tree: MindmapTreeNode[]
}

function MindmapPage() {
  const { summaryId } = useParams<{ summaryId: string }>()
  const { t } = useLanguage()

  // ReactFlow State — Nodes/Edges mit Drag-Unterstützung
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [treeData, setTreeData] = useState<MindmapTreeNode[]>([])

  // Ref um Layout-Neuberechnung von Drag zu unterscheiden
  const layoutVersionRef = useRef(0)

  // Deep Dive Hook
  const { expanding, expandNode } = useMindmapDeepDive(treeData, setTreeData, setError)

  // Layout berechnen und Nodes/Edges setzen
  function applyLayout(tree: MindmapTreeNode[]) {
    const result = treeLayout(tree)
    layoutVersionRef.current += 1
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  // Layout neu berechnen wenn sich treeData ändert (z.B. nach Deep Dive)
  useEffect(() => {
    if (treeData.length > 0) applyLayout(treeData)
  }, [treeData])

  // Mindmap vom Backend laden
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
      applyLayout(data.tree)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (summaryId) loadMindmap()
  }, [summaryId])

  // Einzelklick — Selektion
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  // Doppelklick — Deep Dive via Hook
  const onNodeDoubleClick = useCallback(
    async (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node)
      await expandNode(node)
    },
    [expandNode],
  )

  // --- Loading Screen ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen"
        style={{ backgroundColor: 'var(--color-bg-deep)' }}>
        <div className="text-center animate-fade-in">
          <p className="hud-title text-sm text-glow mb-2">{t.mindmap.generating}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t.mindmap.generatingHint}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg-deep)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b"
        style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-4">
          <Link to="/archiv" className="text-xs transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.mindmap.backToDashboard}
          </Link>
          <h1 className="hud-title text-sm text-glow">{t.mindmap.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          {expanding && (
            <span className="text-xs animate-glow-pulse"
              style={{ color: 'var(--color-primary)' }}>
              {t.mindmap.expanding}
            </span>
          )}
          {selectedNode && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {selectedNode.data.label}
            </span>
          )}
        </div>
      </div>

      {/* Fehler-Banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2 rounded-lg text-sm border"
          style={{ background: 'rgba(255,59,92,0.1)', borderColor: 'rgba(255,59,92,0.3)',
            color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {/* Canvas: ReactFlow Tree */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          style={{ backgroundColor: 'var(--color-bg-deep)' }}>
          <Controls position="bottom-left"
            style={{ background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px', boxShadow: '0 0 15px rgba(0,212,255,0.1)' }} />
          <MiniMap position="bottom-right"
            nodeColor={() => 'var(--color-highlight-strong)'}
            maskColor="rgba(10, 14, 23, 0.8)"
            style={{ background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)', borderRadius: '8px' }} />
          <Background variant={BackgroundVariant.Dots}
            color="var(--color-glow-soft)" gap={25} size={1} />
        </ReactFlow>
      </div>

      {/* Detail-Panel unten */}
      {selectedNode && selectedNode.data.detail && (
        <div className="px-6 py-4 border-t"
          style={{ backgroundColor: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border)' }}>
          <h3 className="text-xs font-semibold mb-1"
            style={{ color: 'var(--color-primary)' }}>
            {selectedNode.data.label}
          </h3>
          <p className="text-sm leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}>
            {selectedNode.data.detail}
          </p>
        </div>
      )}
    </div>
  )
}

export default MindmapPage
