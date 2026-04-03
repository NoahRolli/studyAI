// MetisPage — Orchestrator für den Metis Knowledge-Graph
// Toggle zwischen 2D-Graph, 3D-Sphäre (lazy) und Listen-Ansicht.
// Toolbar mit Sync, Auto-Link, Auto-Cluster. Detail-Panel bei Klick.

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { get, post, put } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import MetisGraph2D from '../components/metis/MetisGraph2D'
import MetisToolbar from '../components/metis/MetisToolbar'
import MetisListView from '../components/metis/MetisListView'
import MetisNodeDetail from '../components/metis/MetisNodeDetail'
import type { MetisGraph, MetisViewMode, MetisNode } from '../types/metis'

// 3D Sphäre lazy-loaded
const MetisSphere3D = lazy(
  () => import('../components/metis/MetisSphere3D')
)

export default function MetisPage() {
  const { t } = useLanguage()
  const [graph, setGraph] = useState<MetisGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [view, setView] = useState<MetisViewMode>('2d')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [clustering, setClustering] = useState(false)
  const [selectedNode, setSelectedNode] = useState<MetisNode | null>(null)

  // Graph laden
  const loadGraph = useCallback(async () => {
    try {
      const data = await get<MetisGraph>('/api/metis/graph')
      setGraph(data)
    } catch (err) {
      console.error('Metis graph load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await post('/api/metis/sync')
      await loadGraph()
    } catch (err) {
      console.error('Metis sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [loadGraph])

  const handleAutoLink = useCallback(async () => {
    setLinking(true)
    try {
      await post('/api/metis/auto-link')
      await loadGraph()
    } catch (err) {
      console.error('Metis auto-link failed:', err)
    } finally {
      setLinking(false)
    }
  }, [loadGraph])

  const handleAutoCluster = useCallback(async () => {
    setClustering(true)
    try {
      await post('/api/metis/auto-cluster')
      await loadGraph()
    } catch (err) {
      console.error('Metis auto-cluster failed:', err)
    } finally {
      setClustering(false)
    }
  }, [loadGraph])

  const handlePositionUpdate = useCallback(async (
    nodeId: number, x: number | null, y: number | null,
  ) => {
    try {
      await put(`/api/metis/nodes/${nodeId}/position`, {
        pos_x: x, pos_y: y,
      })
    } catch (err) {
      console.error('Position update failed:', err)
    }
  }, [])

  // Node-Klick Handler
  const handleNodeClick = useCallback((nodeId: number) => {
    const node = graph.nodes.find(n => n.id === nodeId)
    setSelectedNode(node || null)
  }, [graph.nodes])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--color-text-muted)]">
          {t.common.loading}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="hud-title text-glow text-2xl">{t.metis.title}</h1>
        <MetisToolbar
          view={view}
          onViewChange={setView}
          onSync={handleSync}
          onAutoLink={handleAutoLink}
          onAutoCluster={handleAutoCluster}
          syncing={syncing}
          linking={linking}
          clustering={clustering}
          nodeCount={graph.nodes.length}
          edgeCount={graph.edges.length}
          clusterCount={graph.clusters.length}
        />
      </div>

      {/* Graph + Detail-Panel */}
      <div className="flex-1 hud-card overflow-hidden relative">
        {graph.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-muted)]">
              {t.metis.noNodes}
            </p>
          </div>
        ) : view === 'list' ? (
          <MetisListView graph={graph} />
        ) : view === '3d' ? (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--color-text-muted)]">
                {t.common.loading}
              </p>
            </div>
          }>
            <MetisSphere3D
              graph={graph}
              onNodeClick={handleNodeClick}
            />
          </Suspense>
        ) : (
          <MetisGraph2D
            graph={graph}
            onPositionUpdate={handlePositionUpdate}
            onNodeClick={handleNodeClick}
          />
        )}

        {/* Detail-Panel */}
        {selectedNode && (
          <MetisNodeDetail
            node={selectedNode}
            graph={graph}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  )
}
