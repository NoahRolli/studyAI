// MetisPage — Orchestrator für den Metis Knowledge-Graph
// UI-Shell: Toolbar, Sphäre/Liste, Detail-Panels, MiniMap, Fullscreen
// Datenlogik ausgelagert in useMetisGraph

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import { useMetisGraph } from '../hooks/useMetisGraph'
import MetisToolbar from '../components/metis/MetisToolbar'
import ConceptListView from '../components/metis/ConceptListView'
import ConceptDetailPanel from '../components/metis/ConceptDetailPanel'
import ClusterDetail from '../components/metis/ClusterDetail'
import MetisMiniMap3D from '../components/metis/MetisMiniMap3D'
import type { MetisViewMode } from '../types/metis'

const MetisSphere3D = lazy(
  () => import('../components/metis/MetisSphere3D')
)

export default function MetisPage() {
  const { t } = useLanguage()
  const {
    conceptGraph, sphereGraph, loading, loadGraph,
    syncing, linking, clustering,
    handleSync, handleAutoLink, handleAutoCluster,
  } = useMetisGraph()

  const [view, setView] = useState<MetisViewMode>('3d')
  const [selectedConceptId, setSelectedConceptId] = useState<number | null>(null)
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null)
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

  // Selection-Handler
  const handleNodeClick = useCallback((nodeId: number) => {
    setSelectedCluster(null); setSelectedFolder(null)
    setSelectedConceptId(nodeId)
  }, [])

  const handleClusterClick = useCallback((id: number) => {
    setSelectedConceptId(null); setSelectedFolder(null)
    setSelectedCluster(id)
  }, [])

  const handleFolderClick = useCallback((id: number) => {
    setSelectedConceptId(null); setSelectedCluster(null)
    setSelectedFolder(id)
  }, [])

  // Fullscreen Escape-Listener
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
          <ConceptListView graph={conceptGraph} onRefresh={loadGraph} />
        ) : view === 'graph' ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-muted)]">
              Graph-View kommt bald
            </p>
          </div>
        ) : (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--color-text-muted)]">{t.common.loading}</p>
            </div>
          }>
            <MetisSphere3D
              graph={sphereGraph}
              onNodeClick={handleNodeClick}
              onClusterClick={handleClusterClick}
              onFolderClick={handleFolderClick}
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
              >{fullscreen ? '✕' : '⛶'}</button>
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

        {/* Detail-Panels */}
        {selectedCluster !== null && (
          <ClusterDetail clusterId={selectedCluster} graph={sphereGraph}
            onClose={() => setSelectedCluster(null)}
            onNodeSelect={(nid) => { setSelectedCluster(null); setSelectedConceptId(nid) }} />
        )}
        {selectedFolder !== null && (
          <ClusterDetail folderId={selectedFolder} graph={sphereGraph}
            onClose={() => setSelectedFolder(null)}
            onNodeSelect={(nid) => { setSelectedFolder(null); setSelectedConceptId(nid) }} />
        )}
        {selectedConceptId && (
          <ConceptDetailPanel
            conceptId={selectedConceptId}
            onClose={() => setSelectedConceptId(null)}
            onEdgeReviewed={loadGraph}
          />
        )}
      </div>
    </div>
  )
}
