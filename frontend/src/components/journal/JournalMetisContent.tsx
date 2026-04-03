// JournalMetisContent — Verschlüsselter Knowledge-Graph als Journal-Tab
// Merged View: Journal-Einträge (Cyan) + öffentliche Nodes (transparent)
// Wiederverwendet MetisToolbar, MetisSphere3D, MetisGraph2D etc. wie v1

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import MetisGraph2D from '../metis/MetisGraph2D'
import MetisToolbar from '../metis/MetisToolbar'
import MetisListView from '../metis/MetisListView'
import MetisNodeDetail from '../metis/MetisNodeDetail'
import MetisMiniMap3D from '../metis/MetisMiniMap3D'
import type { MetisGraph, MetisViewMode, MetisNode } from '../../types/metis'
import type { JournalMetisGraph } from '../../types/metis'

const MetisSphere3D = lazy(
  () => import('../metis/MetisSphere3D')
)

// Journal-Metis Graph → MetisGraph Adapter
// Filtert optional Public-Nodes raus, mappt String-IDs auf Numbers
function adaptGraph(
  jGraph: JournalMetisGraph, showPublic: boolean,
): MetisGraph {
  const nodes = showPublic
    ? jGraph.nodes
    : jGraph.nodes.filter(n => n.realm === 'journal')
  const nodeIds = new Set(nodes.map(n => n.id))
  const edges = jGraph.edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target)
  )

  // ID-Map: String → fortlaufende Number
  const idMap = new Map<string, number>()
  nodes.forEach((n, i) => idMap.set(n.id, i + 1))

  return {
    nodes: nodes.map(n => ({
      id: idMap.get(n.id) || 0,
      type: n.realm === 'journal' ? 'entry' as any : n.type as any,
      source_id: n.source_id,
      title: n.label,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      embedding_stale: false,
      cluster_ids: [],
    })),
    edges: edges.map(e => ({
      id: idMap.get(e.id) || 0,
      source_node_id: idMap.get(e.source) || 0,
      target_node_id: idMap.get(e.target) || 0,
      relation_type: 'related' as const,
      strength: e.strength,
    })),
    clusters: [],
  }
}

export default function JournalMetisContent() {
  const { t } = useLanguage()
  const [rawGraph, setRawGraph] = useState<JournalMetisGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [view, setView] = useState<MetisViewMode>('3d')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [clustering, setClustering] = useState(false)
  const [selectedNode, setSelectedNode] = useState<MetisNode | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showPublic, setShowPublic] = useState(true)

  // Kamera für MiniMap
  const cameraRef = useRef({ azimuth: 0, elevation: 0, distance: 22 })
  const [, setCameraTick] = useState(0)
  const lastCameraUpdate = useRef(0)

  const handleCameraMove = useCallback((
    az: number, el: number, dist: number,
  ) => {
    cameraRef.current = { azimuth: az, elevation: el, distance: dist }
    const now = Date.now()
    if (now - lastCameraUpdate.current > 100) {
      lastCameraUpdate.current = now
      setCameraTick(p => p + 1)
    }
  }, [])

  // --- API Calls ---
  const loadGraph = useCallback(async () => {
    try {
      const data = await get<JournalMetisGraph>(
        '/api/journal/metis/graph',
      )
      setRawGraph(data)
    } catch (err) {
      console.error('Journal Metis load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await post('/api/journal/metis/sync')
      await loadGraph()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally { setSyncing(false) }
  }, [loadGraph])

  const handleAutoLink = useCallback(async () => {
    setLinking(true)
    try {
      await post('/api/journal/metis/auto-link')
      await loadGraph()
    } catch (err) {
      console.error('Auto-link failed:', err)
    } finally { setLinking(false) }
  }, [loadGraph])

  const handleAutoCluster = useCallback(async () => {
    setClustering(true)
    try {
      await post('/api/journal/metis/auto-cluster')
      await loadGraph()
    } catch (err) {
      console.error('Auto-cluster failed:', err)
    } finally { setClustering(false) }
  }, [loadGraph])

  const handleNodeClick = useCallback((nodeId: number) => {
    const found = graph.nodes.find(n => n.id === nodeId)
    setSelectedNode(found || null)
  }, [])

  // Escape für Fullscreen
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fullscreen])

  // Adapted Graph
  const graph = adaptGraph(rawGraph, showPublic)

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[var(--color-text-muted)]">
          {t.common.loading}
        </p>
      </div>
    )
  }

  // Wrapper: Fullscreen übernimmt ganzen Screen, sonst Tab-Content
  const wrapperClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-deep)]'
    : 'flex flex-col gap-4'

  const graphClass = fullscreen
    ? 'flex-1 overflow-hidden relative'
    : 'overflow-hidden relative border border-[var(--color-border)] rounded-lg'

  // Graph-Container-Höhe im Tab-Modus
  const graphStyle = fullscreen ? {} : { height: 'calc(100vh - 320px)' }

  return (
    <div className={wrapperClass}>
      {/* Header — wie v1: Titel + MetisToolbar */}
      <div className={`flex items-center justify-between ${fullscreen ? 'p-3' : ''}`}>
        {!fullscreen && (
          <div>
            <h2 className="hud-title text-glow text-xl">
              {t.metis?.title || 'METIS'}
            </h2>
            <span style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '10px',
              color: '#00d4ff',
              letterSpacing: '2px',
            }}>JOURNAL</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          {/* Public-Toggle vor der Toolbar */}
          <button
            className="hud-btn text-xs px-3 py-1"
            style={{
              opacity: showPublic ? 1 : 0.4,
              borderColor: showPublic ? '#d4a574' : 'var(--color-border)',
            }}
            onClick={() => setShowPublic(!showPublic)}
            title={showPublic ? 'Public ausblenden' : 'Public einblenden'}
          >P</button>
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
      </div>

      {/* Graph-Container — identisch wie v1 */}
      <div className={graphClass} style={graphStyle}>
        {graph.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-muted)]">
              {t.metis?.noNodes || 'Keine Nodes'}
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
              onCameraMove={handleCameraMove}
              transparent={true}
            />
          </Suspense>
        ) : (
          <MetisGraph2D
            graph={graph}
            onPositionUpdate={() => {}}
            onNodeClick={handleNodeClick}
            transparent={true}
          />
        )}

        {/* Fullscreen-Button — oben rechts wie v1 */}
        {view !== 'list' && graph.nodes.length > 0 && (
          <div className="absolute top-2 right-2 z-20">
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="hud-btn text-xs px-2 py-1"
              title={fullscreen ? 'Escape' : 'Fullscreen'}
            >{fullscreen ? '✖' : '⛶'}</button>
          </div>
        )}

        {/* MiniMap 3D */}
        {view === '3d' && graph.nodes.length > 0 && (
          <MetisMiniMap3D
            graph={graph}
            cameraAzimuth={cameraRef.current.azimuth}
            cameraElevation={cameraRef.current.elevation}
            cameraDistance={cameraRef.current.distance}
          />
        )}

        {/* Detail Panel */}
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
