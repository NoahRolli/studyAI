// JournalMindmapPage — Fullscreen Mindmap aus Journal-Clustern + Storylines
// Route: /journal/mindmap
// Wurzel → Cluster-Labels → Einträge (Titel)

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import { treeLayout, neuralLayout } from '../utils/mindmapLayouts'
import type { ClusterResult, StorylineResult } from '../types/models'
import type { MindmapTreeNode } from '../utils/mindmapLayouts'

type LayoutMode = 'tree' | 'neural'

function JournalMindmapPage() {
  const { t } = useLanguage()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('tree')
  const [treeData, setTreeData] = useState<MindmapTreeNode[]>([])
  const [selectedNode, setSelectedNode] = useState<{
    label: string
    detail: string
  } | null>(null)

  function applyLayout(tree: MindmapTreeNode[], mode: LayoutMode) {
    const result = mode === 'neural' ? neuralLayout(tree) : treeLayout(tree)
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  function switchLayout(mode: LayoutMode) {
    setLayoutMode(mode)
    if (treeData.length > 0) applyLayout(treeData, mode)
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [clusters, storylines] = await Promise.all([
          post<ClusterResult[]>('/api/journal/analytics/clusters').catch(() => []),
          post<StorylineResult[]>('/api/journal/analytics/storylines').catch(() => []),
        ])
        if (clusters.length === 0) {
          setError(t.mindmap.minEntries)
          setLoading(false)
          return
        }
        const tree = buildTree(clusters, storylines, t)
        setTreeData(tree)
        applyLayout(tree, layoutMode)
      } catch (err) {
        setError(err instanceof Error ? err.message : t.common.error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: 'var(--color-bg-deep)' }}
      >
        <div className="text-center animate-fade-in">
          <p className="hud-title text-sm text-glow mb-2">{t.mindmap.journalTitle}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t.mindmap.journalGeneratingHint}
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
            to="/journal"
            className="text-xs transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.mindmap.backToJournal}
          </Link>
          <h1 className="hud-title text-sm text-glow">{t.mindmap.journalTitle}</h1>
        </div>
        <div
          className="flex gap-1 p-1 rounded-lg"
          style={{ backgroundColor: 'var(--color-bg-surface)' }}
        >
          <button
            onClick={() => switchLayout('tree')}
            className={`hud-tab ${layoutMode === 'tree' ? 'hud-tab-active' : ''}`}
          >
            {t.mindmap.layoutTree}
          </button>
          <button
            onClick={() => switchLayout('neural')}
            className={`hud-tab ${layoutMode === 'neural' ? 'hud-tab-active' : ''}`}
          >
            {t.mindmap.layoutNeural}
          </button>
        </div>
      </div>

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

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_e, node) => {
            setSelectedNode({
              label: node.data.label,
              detail: node.data.detail || '',
            })
          }}
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
            }}
          />
          <MiniMap
            position="bottom-right"
            nodeColor={() => 'var(--color-highlight-strong)'}
            maskColor="rgba(10, 14, 23, 0.8)"
            style={{
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
            }}
          />
          <Background
            variant={BackgroundVariant.Dots}
            color="var(--color-glow-soft)"
            gap={25}
            size={1}
          />
        </ReactFlow>
      </div>

      {selectedNode && selectedNode.detail && (
        <div
          className="px-6 py-4 border-t"
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>
            {selectedNode.label}
          </h3>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {selectedNode.detail}
          </p>
        </div>
      )}
    </div>
  )
}

// --- Baum aus Clusters + Storylines bauen ---
function buildTree(
  clusters: ClusterResult[],
  storylines: StorylineResult[],
  t: ReturnType<typeof useLanguage>['t'],
): MindmapTreeNode[] {
  const clusterNodes: MindmapTreeNode[] = clusters.map((cluster, ci) => {
    const relevantStories = storylines.filter((s) =>
      s.entry_ids.some((id) => cluster.entry_ids.includes(id))
    )
    const storyInfo = relevantStories.length > 0
      ? `\n${t.mindmap.storylines}: ${relevantStories.map((s) => `${s.title} (${s.arc_type})`).join(', ')}`
      : ''

    const entryNodes: MindmapTreeNode[] = cluster.titles.map((title, ti) => ({
      id: cluster.entry_ids[ti] + 10000,
      label: title,
      detail: `${t.mindmap.entry} #${cluster.entry_ids[ti]}`,
      depth_level: 2,
      position_x: 0,
      position_y: 0,
      children: [],
    }))

    return {
      id: ci + 1000,
      label: cluster.label,
      detail: `${cluster.entry_ids.length} ${t.common.entries}${storyInfo}`,
      depth_level: 1,
      position_x: 0,
      position_y: 0,
      children: entryNodes,
    }
  })

  return [{
    id: 1,
    label: t.journal.title,
    detail: `${clusters.length} ${t.mindmap.themes}, ${storylines.length} ${t.mindmap.storylines}`,
    depth_level: 0,
    position_x: 0,
    position_y: 0,
    children: clusterNodes,
  }]
}

export default JournalMindmapPage