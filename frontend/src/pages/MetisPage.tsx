// MetisPage — Orchestrator für den Metis Knowledge-Graph
// Toggle zwischen 2D-Graph, 3D-Sphäre und Listen-Ansicht.
// Toolbar mit Sync, Auto-Link, Auto-Cluster Buttons.
// Lädt Graph-Daten vom Backend und reicht sie an Kind-Komponenten weiter.

import { useState, useEffect, useCallback } from 'react'
import { get, post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import MetisGraph2D from '../components/metis/MetisGraph2D'
import MetisToolbar from '../components/metis/MetisToolbar'
import MetisListView from '../components/metis/MetisListView'
import type { MetisGraph, MetisViewMode } from '../types/metis'

export default function MetisPage() {
  const { t } = useLanguage()
  const [graph, setGraph] = useState<MetisGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [view, setView] = useState<MetisViewMode>('2d')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Graph-Daten vom Backend laden
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

  // Sync: Notes + Summaries mit Graph synchronisieren
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

  // Node-Position speichern (Pin/Unpin)
  const handlePositionUpdate = useCallback(async (
    nodeId: number, x: number | null, y: number | null,
  ) => {
    try {
      await post(`/api/metis/nodes/${nodeId}/position`, {
        pos_x: x, pos_y: y,
      })
    } catch (err) {
      console.error('Position update failed:', err)
    }
  }, [])

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
      {/* Header mit Titel + Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="hud-title text-glow text-2xl">{t.metis.title}</h1>
        </div>
        <MetisToolbar
          view={view}
          onViewChange={setView}
          onSync={handleSync}
          syncing={syncing}
          nodeCount={graph.nodes.length}
          edgeCount={graph.edges.length}
          clusterCount={graph.clusters.length}
        />
      </div>

      {/* Graph-Bereich */}
      <div className="flex-1 hud-card overflow-hidden relative">
        {graph.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-muted)]">
              {t.metis.noNodes}
            </p>
          </div>
        ) : view === 'list' ? (
          <MetisListView graph={graph} />
        ) : (
          <MetisGraph2D
            graph={graph}
            onPositionUpdate={handlePositionUpdate}
          />
        )}
      </div>
    </div>
  )
}
