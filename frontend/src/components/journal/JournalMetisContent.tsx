// JournalMetisContent — Verschlüsselter Knowledge-Graph als Journal-Tab
// Merged View: Journal-Einträge (Cyan) + öffentliche Nodes (transparent)
// Keine State-Updates für Kamera — MiniMap liest direkt aus Ref

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import MetisGraph2D from '../metis/MetisGraph2D'
import MetisToolbar from '../metis/MetisToolbar'
import MetisListView from '../metis/MetisListView'
import MetisNodeDetail from '../metis/MetisNodeDetail'
import MetisMiniMap3D from '../metis/MetisMiniMap3D'
import { adaptGraph } from '../metis/journalMetisAdapter'
import type { MetisViewMode, MetisNode } from '../../types/metis'
import type { JournalMetisGraph } from '../../types/metis'

const MetisSphere3D = lazy(() => import('../metis/MetisSphere3D'))

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
  const [showLabels, setShowLabels] = useState(false)

  // Kamera-Ref — kein State, kein Re-Render
  const cameraRef = useRef({ azimuth: 0, elevation: 0, distance: 50 })

  // Kamera-Update ohne State — nur Ref aktualisieren
  const handleCameraMove = useCallback((
    az: number, el: number, dist: number,
  ) => {
    cameraRef.current = { azimuth: az, elevation: el, distance: dist }
  }, [])

  const loadGraph = useCallback(async () => {
    try {
      const data = await get<JournalMetisGraph>('/api/journal/metis/graph')
      setRawGraph(data)
    } catch (err) {
      console.error('Journal Metis load failed:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await post('/api/journal/metis/sync')
      await loadGraph()
    } catch (err) { console.error('Sync failed:', err) }
    finally { setSyncing(false) }
  }, [loadGraph])

  const handleAutoLink = useCallback(async () => {
    setLinking(true)
    try {
      await post('/api/journal/metis/auto-link')
      await loadGraph()
    } catch (err) { console.error('Auto-link failed:', err) }
    finally { setLinking(false) }
  }, [loadGraph])

  const handleAutoCluster = useCallback(async () => {
    setClustering(true)
    try {
      await post('/api/journal/metis/auto-cluster')
      await loadGraph()
    } catch (err) { console.error('Auto-cluster failed:', err) }
    finally { setClustering(false) }
  }, [loadGraph])

  const graph = adaptGraph(rawGraph, showPublic)

  const handleNodeClick = useCallback((nodeId: number) => {
    const found = graph.nodes.find(n => n.id === nodeId)
    setSelectedNode(found || null)
  }, [graph.nodes])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fullscreen])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
      </div>
    )
  }

  const wrapperClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-deep)]'
    : 'flex flex-col gap-4'
  const graphClass = fullscreen
    ? 'flex-1 overflow-hidden relative'
    : 'overflow-hidden relative border border-[var(--color-border)] rounded-lg'
  const graphStyle = fullscreen ? {} : { height: 'calc(100vh - 250px)' }

  return (
    <div className={wrapperClass}>
      <div className={`flex items-center justify-between ${fullscreen ? 'p-3' : ''}`}>
        {!fullscreen && (
          <h2 className="hud-title text-glow text-xl">
            {t.metis?.title || 'METIS'}
          </h2>
        )}
        <MetisToolbar
          view={view} onViewChange={setView}
          onSync={handleSync} onAutoLink={handleAutoLink}
          onAutoCluster={handleAutoCluster}
          syncing={syncing} linking={linking} clustering={clustering}
          nodeCount={graph.nodes.length} edgeCount={graph.edges.length}
          clusterCount={graph.clusters.length}
        />
      </div>

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
              <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
            </div>
          }>
            <MetisSphere3D graph={graph} onNodeClick={handleNodeClick}
              onCameraMove={handleCameraMove} transparent={true}
              showLabels={showLabels} />
          </Suspense>
        ) : (
          <MetisGraph2D graph={graph} onPositionUpdate={() => {}}
            onNodeClick={handleNodeClick} transparent={true} />
        )}

        {/* Overlay-Buttons */}
        {view !== 'list' && graph.nodes.length > 0 && (
          <>
            <div className="absolute top-2 left-2 z-20 flex flex-col gap-1">
              <button className="hud-btn text-xs px-2 py-1"
                style={{
                  opacity: showPublic ? 1 : 0.4,
                  borderColor: showPublic
                    ? 'var(--color-primary)' : 'var(--color-border)',
                }}
                onClick={() => setShowPublic(!showPublic)} title="V1"
              >V1</button>
              <button className="hud-btn text-xs px-2 py-1"
                onClick={() => setShowLabels(!showLabels)}
                style={{ opacity: showLabels ? 1 : 0.4 }}
                title="Labels ein/aus"
              >Aa</button>
            </div>
            <div className="absolute top-2 right-2 z-20">
              <button onClick={() => setFullscreen(!fullscreen)}
                className="hud-btn text-xs px-2 py-1"
                title={fullscreen ? 'Escape' : 'Fullscreen'}
              >{fullscreen ? '✖' : '⛶'}</button>
            </div>
          </>
        )}

        {view === '3d' && graph.nodes.length > 0 && (
          <MetisMiniMap3D graph={graph}
            cameraAzimuth={cameraRef.current.azimuth}
            cameraElevation={cameraRef.current.elevation}
            cameraDistance={cameraRef.current.distance} />
        )}

        {selectedNode && (
          <MetisNodeDetail node={selectedNode} graph={graph}
            onEdgeReviewed={loadGraph}
            onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  )
}
