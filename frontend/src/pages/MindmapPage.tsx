// MindmapPage — Fullscreen Mindmap mit zwei Darstellungsoptionen
// Route: /mindmap/:summaryId
// Layouts: Tree (horizontal) + Neural (radial mit Ast-Sektoren)
// Einzelklick: Selektieren + Zoom-to-Cluster (Neural, Depth 1)
// Doppelklick: Deep Dive — AI generiert Unterknoten
// Hover (Neural): Ganzer Ast leuchtet auf, Rest wird gedimmt

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Node } from 'reactflow'
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { get, post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import { useMindmapInteraction } from '../hooks/useMindmapInteraction'
import { useMindmapDeepDive } from '../hooks/useMindmapDeepDive'
import {
  treeLayout,
  neuralLayout,
  type MindmapTreeNode,
} from '../utils/mindmapLayouts'

interface MindmapResponse {
  summary_id: number
  tree: MindmapTreeNode[]
}

type LayoutMode = 'tree' | 'neural'

function MindmapPage() {
  const { summaryId } = useParams<{ summaryId: string }>()
  const { t } = useLanguage()

  // Layout-Daten
  const [rawNodes, setRawNodes] = useState<Node[]>([])
  const [rawEdges, setRawEdges] = useState<import('reactflow').Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('tree')
  const [treeData, setTreeData] = useState<MindmapTreeNode[]>([])

  // Hooks für Interaktion und Deep Dive
  const interaction = useMindmapInteraction(layoutMode)
  const { expanding, expandNode } = useMindmapDeepDive(treeData, setTreeData, setError)

  // Layout berechnen
  function applyLayout(tree: MindmapTreeNode[], mode: LayoutMode) {
    const result = mode === 'neural' ? neuralLayout(tree) : treeLayout(tree)
    setRawNodes(result.nodes)
    setRawEdges(result.edges)
  }

  // Highlight anwenden → finale Display-Daten
  const displayData = useMemo(
    () => interaction.applyHighlight(rawNodes, rawEdges),
    [rawNodes, rawEdges, interaction.applyHighlight],
  )

  // Layout neu berechnen wenn sich treeData ändert (z.B. nach Deep Dive)
  useEffect(() => {
    if (treeData.length > 0) applyLayout(treeData, layoutMode)
  }, [treeData])

  function switchLayout(mode: LayoutMode) {
    setLayoutMode(mode)
    if (treeData.length > 0) applyLayout(treeData, mode)
  }

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
      applyLayout(data.tree, layoutMode)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (summaryId) loadMindmap()
  }, [summaryId])

  // Einzelklick — Selektion + Zoom-to-Cluster
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    interaction.zoomToBranch(node, rawNodes)
  }, [rawNodes, interaction.zoomToBranch])

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
          <Link to="/" className="text-xs transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.mindmap.backToDashboard}
          </Link>
          <h1 className="hud-title text-sm text-glow">{t.mindmap.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-1 p-1 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-surface)' }}>
            <button onClick={() => switchLayout('tree')}
              className={`hud-tab ${layoutMode === 'tree' ? 'hud-tab-active' : ''}`}>
              {t.mindmap.layoutTree}
            </button>
            <button onClick={() => switchLayout('neural')}
              className={`hud-tab ${layoutMode === 'neural' ? 'hud-tab-active' : ''}`}>
              {t.mindmap.layoutNeural}
            </button>
          </div>
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

      {/* React Flow Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={displayData.nodes}
          edges={displayData.edges}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={interaction.onNodeMouseEnter}
          onNodeMouseLeave={interaction.onNodeMouseLeave}
          onInit={interaction.onInit}
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
            nodeColor={() => 'rgba(0, 212, 255, 0.6)'}
            maskColor="rgba(10, 14, 23, 0.8)"
            style={{ background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)', borderRadius: '8px' }} />
          <Background variant={BackgroundVariant.Dots}
            color="rgba(0, 212, 255, 0.1)" gap={25} size={1} />
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