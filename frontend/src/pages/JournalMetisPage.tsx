// JournalMetisPage — Verschlüsselter Knowledge-Graph im Journal
// Merged View: Journal-Einträge (Cyan) + öffentliche Nodes (transparent)
// Public Nodes können ausgeblendet werden.
// Route: /journal/metis

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { get, post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import MetisGraph2D from '../components/metis/MetisGraph2D'
import MetisListView from '../components/metis/MetisListView'
import MetisNodeDetail from '../components/metis/MetisNodeDetail'
import MetisMiniMap3D from '../components/metis/MetisMiniMap3D'
import type { MetisGraph, MetisViewMode, MetisNode } from '../types/metis'
import type { JournalMetisGraph } from '../types/metis'

const MetisSphere3D = lazy(
  () => import('../components/metis/MetisSphere3D')
)

// Journal-Metis Graph → MetisGraph Adapter
// Filtert optional Public-Nodes raus, mappt String-IDs auf Numbers
function adaptGraph(
  jGraph: JournalMetisGraph, showPublic: boolean,
): MetisGraph {
  // Filtern
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

export default function JournalMetisPage() {
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
    const node = graph.nodes.find(n => n.id === nodeId)
    setSelectedNode(node || null)
  }, [])

  // Escape für Fullscreen
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fullscreen])

  // Adapted graph (mit/ohne Public)
  const graph = adaptGraph(rawGraph, showPublic)

  // Stats
  const jCount = rawGraph.nodes.filter(n => n.realm === 'journal').length
  const pCount = rawGraph.nodes.filter(n => n.realm === 'public').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--color-text-muted)]">
          {t.common.loading}
        </p>
      </div>
    )
  }

  const wrapCls = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-deep)]'
    : 'flex flex-col h-full gap-4 p-4'
  const graphCls = fullscreen
    ? 'flex-1 overflow-hidden relative'
    : 'flex-1 overflow-hidden relative border border-[var(--color-border)] rounded-lg'

  return (
    <div className={wrapCls}>
      {/* Header */}
      <div className={`flex items-center justify-between ${fullscreen ? 'p-3' : ''}`}>
        {!fullscreen && (
          <div>
            <h1 className="hud-title text-glow text-2xl">
              {t.metis?.title || 'METIS'}
            </h1>
            <span style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '10px',
              color: '#00d4ff',
              letterSpacing: '2px',
            }}>JOURNAL</span>
          </div>
        )}
        {/* Toolbar inline */}
        <div className="flex items-center gap-3"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          {/* Stats */}
          <div className="flex gap-3" style={{
            fontSize: '11px',
            color: 'var(--color-text-secondary)',
          }}>
            <span style={{ color: '#00d4ff' }}>{jCount} J</span>
            <span style={{ color: '#d4a574' }}>{pCount} P</span>
            <span>{graph.edges.length} E</span>
          </div>
          {/* View Toggle */}
          <div className="flex border rounded overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}>
            {(['3d', '2d', 'list'] as MetisViewMode[]).map(m => (
              <button key={m}
                className="px-2 py-1 text-xs uppercase"
                style={{
                  background: view === m
                    ? 'var(--color-primary)' : 'transparent',
                  color: view === m
                    ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                  fontFamily: 'Orbitron, monospace',
                }} onClick={() => setView(m)}>{m}</button>
            ))}
          </div>
          {/* Public Toggle */}
          <button
            className="hud-btn text-xs px-3 py-1"
            style={{
              opacity: showPublic ? 1 : 0.4,
              borderColor: showPublic ? '#d4a574' : 'var(--color-border)',
            }}
            onClick={() => setShowPublic(!showPublic)}
            title={showPublic ? 'Public ausblenden' : 'Public einblenden'}
          >P</button>
          {/* Actions */}
          <button className="hud-btn text-xs px-3 py-1"
            onClick={handleSync} disabled={syncing}>
            {syncing ? '...' : 'SYNC'}
          </button>
          <button className="hud-btn text-xs px-3 py-1"
            onClick={handleAutoLink} disabled={linking}>
            {linking ? '...' : 'DETECT'}
          </button>
          <button className="hud-btn text-xs px-3 py-1"
            onClick={handleAutoCluster} disabled={clustering}>
            {clustering ? '...' : 'GROUP'}
          </button>
        </div>
      </div>

      {/* Graph */}
      <div className={graphCls}>
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
            onPositionUpdate={() => {}}
            graph={graph}
            onNodeClick={handleNodeClick}
            transparent={true}
          />
        )}

        {/* Fullscreen Button */}
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
