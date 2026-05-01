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
import { get, post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import { treeLayout } from '../utils/mindmapLayouts'
import type { TopicCluster, TopicsOverview, StorylineResult } from '../types/models'
import type { MindmapTreeNode } from '../utils/mindmapLayouts'

function JournalMindmapPage() {
  const { t } = useLanguage()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [_treeData, setTreeData] = useState<MindmapTreeNode[]>([])
  const [selectedNode, setSelectedNode] = useState<{
    label: string
    detail: string
  } | null>(null)

  // Layout berechnen und Nodes/Edges setzen
  function applyLayout(tree: MindmapTreeNode[]) {
    const result = treeLayout(tree)
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [overview, storylines] = await Promise.all([
          get<TopicsOverview>('/api/journal/insights/topics').catch(
            () => ({ topics: [] } as Partial<TopicsOverview> as TopicsOverview)
          ),
          post<StorylineResult[]>('/api/journal/analytics/storylines').catch(() => []),
        ])
        const topics = overview?.topics ?? []
        if (topics.length === 0) {
          setError(t.mindmap.minEntries)
          setLoading(false)
          return
        }
        const tree = buildTree(topics, storylines, t)
        setTreeData(tree)
        applyLayout(tree)
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

// --- Baum aus Topics + Storylines bauen ---
function buildTree(
  topics: TopicCluster[],
  storylines: StorylineResult[],
  t: ReturnType<typeof useLanguage>['t'],
): MindmapTreeNode[] {
  const clusterNodes: MindmapTreeNode[] = topics.map((topic, ci) => {
    const relevantStories = storylines.filter((s) =>
      s.entry_ids.some((id) => topic.member_entry_ids.includes(id))
    )
    const storyInfo = relevantStories.length > 0
      ? `\n${t.mindmap.storylines}: ${relevantStories.map((s) => `${s.title} (${s.arc_type})`).join(', ')}`
      : ''

    const entryNodes: MindmapTreeNode[] = topic.member_titles.map((title, ti) => ({
      id: topic.member_entry_ids[ti] + 10000,
      label: title || `#${topic.member_entry_ids[ti]}`,
      detail: `${t.mindmap.entry} #${topic.member_entry_ids[ti]}`,
      depth_level: 2,
      position_x: 0,
      position_y: 0,
      children: [],
    }))

    // Detail-Text mit Cohesion und avg_mood angereichert
    const moodPart = topic.avg_mood !== null
      ? ` · mood ${topic.avg_mood >= 0 ? '+' : ''}${topic.avg_mood.toFixed(2)}`
      : ''
    const cohesionPart = ` · cohesion ${(topic.cohesion * 100).toFixed(0)}%`

    return {
      id: ci + 1000,
      label: topic.label ?? '(ohne Label)',
      detail: `${topic.member_entry_ids.length} ${t.common.entries}${cohesionPart}${moodPart}${storyInfo}`,
      depth_level: 1,
      position_x: 0,
      position_y: 0,
      children: entryNodes,
    }
  })

  return [{
    id: 1,
    label: t.journal.title,
    detail: `${topics.length} ${t.mindmap.themes}, ${storylines.length} ${t.mindmap.storylines}`,
    depth_level: 0,
    position_x: 0,
    position_y: 0,
    children: clusterNodes,
  }]
}

export default JournalMindmapPage
