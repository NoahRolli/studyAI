// MetisPage — Orchestrator für den Metis Knowledge-Graph
// Konzept-Graph: Schlagworte als Nodes in 3D-Sphäre oder Liste.
// Toolbar, Detail-Panel, MiniMap, Fullscreen, Label-Toggle.

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import { get, post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import MetisToolbar from '../components/metis/MetisToolbar'
import ConceptListView from '../components/metis/ConceptListView'
import MetisMiniMap3D from '../components/metis/MetisMiniMap3D'
import type { MetisViewMode, ConceptGraph, MetisGraph } from '../types/metis'

const MetisSphere3D = lazy(
  () => import('../components/metis/MetisSphere3D')
)

export default function MetisPage() {
  const { t } = useLanguage()
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [view, setView] = useState<MetisViewMode>('3d')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [, setSelectedConceptId] = useState<number | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showLabels, setShowLabels] = useState(false)

  // Kamera-State für MiniMap
  const cameraRef = useRef({ azimuth: 0, elevation: 0, distance: 22 })
  const [, setCameraTick] = useState(0)
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

  // Konzept-Graph als MetisGraph-Format (für Sphäre)
  const sphereGraph = useMemo<MetisGraph>(() => ({
    nodes: conceptGraph.nodes.map(c => ({
      id: c.id, type: 'note' as const, source_id: c.id,
      title: c.name, pos_x: null, pos_y: null,
      embedding_stale: false, cluster_ids: [],
    })),
    edges: conceptGraph.edges.map(e => ({
      id: e.id, source_node_id: e.source,
      target_node_id: e.target,
      relation_type: e.relation_type,
      strength: e.strength,
      status: (e.confirmed === null ? 'suggested'
        : e.confirmed ? 'confirmed' : 'rejected'
      ) as 'suggested' | 'confirmed' | 'rejected',
    })),
    clusters: conceptGraph.clusters.map(cl => ({
      id: cl.id, label: cl.label,
      description: cl.description,
      color: null, node_ids: cl.node_ids,
    })),
  }), [conceptGraph])

  // Konzept-Graph laden
  const loadGraph = useCallback(async () => {
    try {
      const data = await get<ConceptGraph>('/api/concepts/graph')
      setConceptGraph(data)
    } catch (err) {
      console.error('Concept graph load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  // Sync — Konzepte aus Notes + Summaries extrahieren
  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await post('/api/concepts/sync')
      await loadGraph()
    } catch (err) {
      console.error('Concept sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [loadGraph])

  // Auto-Link — Ollama schlägt Relationen vor
  const handleAutoLink = useCallback(async () => {
    setLinking(true)
    try {
      await post('/api/concepts/auto-link')
      await loadGraph()
    } catch (err) {
      console.error('Concept auto-link failed:', err)
    } finally {
      setLinking(false)
    }
  }, [loadGraph])

  // Auto-Cluster — Ollama gruppiert Konzepte thematisch
  const [clustering, setClustering] = useState(false)
  const handleAutoCluster = useCallback(async () => {
    setClustering(true)
    try {
      await post("/api/concepts/auto-cluster")
      await loadGraph()
    } catch (err) {
      console.error("Concept auto-cluster failed:", err)
    } finally {
      setClustering(false)
    }
  }, [loadGraph])

  // Node-Klick in der Sphäre
  const handleNodeClick = useCallback((nodeId: number) => {
    setSelectedConceptId(nodeId)
  }, [])

  // Fullscreen toggle mit Escape-Listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fullscreen])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
      </div>
    )
  }

  const wrapperClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[var(--color-bg-deep)]'
    : 'flex flex-col h-full gap-4 p-4'
  const graphClass = fullscreen
    ? 'flex-1 overflow-hidden relative'
    : 'flex-1 overflow-hidden relative border border-[var(--color-border)] rounded-lg'

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className={`flex items-center justify-between ${fullscreen ? 'p-3' : ''}`}>
        {!fullscreen && (
          <h1 className="hud-title text-glow text-2xl">{t.metis.title}</h1>
        )}
        <MetisToolbar
          view={view}
          onViewChange={setView}
          onSync={handleSync}
          onAutoLink={handleAutoLink}
          onAutoCluster={handleAutoCluster}
          syncing={syncing}
          linking={linking}
          clustering={clustering}
          nodeCount={conceptGraph.nodes.length}
          edgeCount={conceptGraph.edges.length}
          clusterCount={conceptGraph.clusters.length}
        />
      </div>

      {/* Sphäre oder Liste */}
      <div className={graphClass}>
        {conceptGraph.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-muted)]">
              {t.metis.noConcepts || 'Keine Konzepte. Starte einen Sync.'}
            </p>
          </div>
        ) : view === 'list' ? (
          <ConceptListView
            graph={conceptGraph}
            onRefresh={loadGraph}
          />
        ) : (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
            </div>
          }>
            <MetisSphere3D
              graph={sphereGraph}
              onNodeClick={handleNodeClick}
              onCameraMove={handleCameraMove}
              transparent={true}
              showLabels={showLabels}
            />
          </Suspense>
        )}

        {/* Overlay Controls — nur bei 3D */}
        {view === '3d' && conceptGraph.nodes.length > 0 && (
          <>
            <div className="absolute top-2 left-2 z-20">
              <button
                className="hud-btn text-xs px-2 py-1"
                onClick={() => setShowLabels(!showLabels)}
                style={{ opacity: showLabels ? 1 : 0.4 }}
                title="Labels ein/aus"
              >Aa</button>
            </div>
            <div className="absolute top-2 right-2 z-20">
              <button
                onClick={() => setFullscreen(!fullscreen)}
                className="hud-btn text-xs px-2 py-1"
                title={fullscreen ? 'Escape' : 'Fullscreen'}
              >{fullscreen ? 'X' : 'F'}</button>
            </div>
          </>
        )}

        {/* MiniMap für 3D */}
        {view === '3d' && conceptGraph.nodes.length > 0 && (
          <MetisMiniMap3D
            graph={sphereGraph}
            cameraAzimuth={cameraRef.current.azimuth}
            cameraElevation={cameraRef.current.elevation}
            cameraDistance={cameraRef.current.distance}
          />
        )}
      </div>
    </div>
  )
}
