// MetisPage — Orchestrator für den Metis Knowledge-Graph
// 3D-Sphäre (default), 2D-Graph, Listen-Ansicht.
// Toolbar, Detail-Panel, MiniMap für 3D.

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { get, post, put } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import MetisGraph2D from '../components/metis/MetisGraph2D'
import MetisToolbar from '../components/metis/MetisToolbar'
import MetisListView from '../components/metis/MetisListView'
import MetisNodeDetail from '../components/metis/MetisNodeDetail'
import MetisMiniMap3D from '../components/metis/MetisMiniMap3D'
import type { MetisGraph, MetisViewMode, MetisNode } from '../types/metis'

const MetisSphere3D = lazy(
  () => import('../components/metis/MetisSphere3D')
)

export default function MetisPage() {
  const { t } = useLanguage()
  const [graph, setGraph] = useState<MetisGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [view, setView] = useState<MetisViewMode>('3d')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [clustering, setClustering] = useState(false)
  const [selectedNode, setSelectedNode] = useState<MetisNode | null>(null)

  // Kamera-State für MiniMap (useRef um Re-Renders zu vermeiden)
  const cameraRef = useRef({ azimuth: 0, elevation: 0, distance: 15 })
  const [cameraTick, setCameraTick] = useState(0)

  // Kamera-Update — throttled (alle 100ms)
  const lastCameraUpdate = useRef(0)
  const handleCameraMove = useCallback((
    azimuth: number, elevation: number, distance: number,
  ) => {
    cameraRef.current = { azimuth, elevation, distance }
    const now = Date.now()
    if (now - lastCameraUpdate.current > 100) {
      lastCameraUpdate.current = now
      setCameraTick(prev => prev + 1)
    }
  }, [])

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

  const handleNodeClick = useCallback((nodeId: number) => {
    const node = graph.nodes.find(n => n.id === nodeId)
    setSelectedNode(node || null)
  }, [graph.nodes])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
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

      <div className="flex-1 hud-card overflow-hidden relative">
        {graph.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-muted)]">{t.metis.noNodes}</p>
          </div>
        ) : view === 'list' ? (
          <MetisListView graph={graph} />
        ) : view === '3d' ? (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
            </div>
          }>
            <MetisSphere3D
              graph={graph}
              onNodeClick={handleNodeClick}
              onCameraMove={handleCameraMove}
            />
          </Suspense>
        ) : (
          <MetisGraph2D
            graph={graph}
            onPositionUpdate={handlePositionUpdate}
            onNodeClick={handleNodeClick}
          />
        )}

        {/* MiniMap für 3D */}
        {view === '3d' && graph.nodes.length > 0 && (
          <MetisMiniMap3D
            graph={graph}
            cameraAzimuth={cameraRef.current.azimuth}
            cameraElevation={cameraRef.current.elevation}
            cameraDistance={cameraRef.current.distance}
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
