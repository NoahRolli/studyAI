// JournalMetisPage — Verschlüsselter Knowledge-Graph im Journal
// Merged View: Journal-Einträge + öffentliche Metis-Nodes (read-only)
// Route: /journal/metis

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { get, post } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import type {
  JournalMetisGraph, JournalMetisNode, MetisViewMode,
} from '../types/metis'

const MetisSphere3D = lazy(
  () => import('../components/metis/MetisSphere3D')
)

// Adapter: JournalMetisGraph → MetisGraph Format für bestehende Komponenten
function adaptGraph(jGraph: JournalMetisGraph) {
  return {
    nodes: jGraph.nodes.map(n => ({
      id: n.id,
      type: n.type as 'note' | 'summary',
      source_id: n.source_id,
      title: n.label,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      embedding_stale: false,
      cluster_ids: n.cluster_ids,
      realm: n.realm,
    })),
    edges: jGraph.edges.map(e => ({
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      relation_type: e.relation_type,
      strength: e.strength,
      realm: e.realm,
    })),
    clusters: jGraph.clusters.map(c => ({
      id: c.id,
      label: c.label,
      description: null,
      color: c.color,
      node_ids: c.node_ids,
      realm: c.realm,
    })),
  }
}

export default function JournalMetisPage() {
  const { t } = useLanguage()
  const [graph, setGraph] = useState<JournalMetisGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [view, setView] = useState<MetisViewMode>('3d')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kamera für MiniMap
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

  const loadGraph = useCallback(async () => {
    try {
      setError(null)
      const data = await get<JournalMetisGraph>('/api/journal/metis/graph')
      setGraph(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
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
      console.error('Journal Metis sync failed:', err)
    } finally {
      setSyncing(false)
    }
  }, [loadGraph])

  // Adapted graph für bestehende Komponenten
  const adapted = adaptGraph(graph)

  if (error) {
    return (
      <div className="p-6">
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
          {t.journal?.locked || 'Journal ist gesperrt'}
        </p>
      </div>
    )
  }

  const journalCount = graph.nodes.filter(n => n.realm === 'journal').length
  const publicCount = graph.nodes.filter(n => n.realm === 'public').length

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 48px)' }}>
      {/* Toolbar */}
      <div
        className="absolute top-3 left-3 z-20 flex items-center gap-3"
        style={{ fontFamily: 'Orbitron, monospace' }}
      >
        {/* Stats */}
        <div className="flex gap-3" style={{
          fontSize: '11px', color: 'var(--color-text-secondary)',
        }}>
          <span title="Journal Nodes">J: {journalCount}</span>
          <span title="Public Nodes">P: {publicCount}</span>
          <span title="Edges">E: {graph.edges.length}</span>
        </div>

        {/* Sync Button */}
        <button
          className="hud-btn text-xs px-3 py-1"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? '...' : 'Sync'}
        </button>

        {/* View Toggle */}
        <div className="flex border rounded overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}>
          {(['3d', '2d', 'list'] as MetisViewMode[]).map(m => (
            <button
              key={m}
              className="px-2 py-1 text-xs uppercase"
              style={{
                background: view === m
                  ? 'var(--color-primary)' : 'transparent',
                color: view === m
                  ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                fontFamily: 'Orbitron, monospace',
              }}
              onClick={() => setView(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Legende */}
      <div
        className="absolute top-3 right-3 z-20 flex gap-3"
        style={{ fontSize: '10px', fontFamily: 'Orbitron, monospace' }}
      >
        <span style={{ color: '#7dd4a3' }}>● Journal</span>
        <span style={{ color: '#d4a574' }}>● Public</span>
      </div>

      {/* Graph Render */}
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <span style={{ color: 'var(--color-text-secondary)' }}>
            Loading...
          </span>
        </div>
      ) : view === '3d' ? (
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <span style={{ color: 'var(--color-text-secondary)' }}>
              Loading 3D...
            </span>
          </div>
        }>
          <MetisSphere3D
            graph={adapted as any}
            onCameraMove={handleCameraMove}
          />
        </Suspense>
      ) : view === 'list' ? (
        <div className="p-6 overflow-y-auto" style={{ height: '100%' }}>
          <div className="grid gap-4 mt-12">
            {graph.nodes.map(n => (
              <div
                key={n.id}
                className="p-3 rounded border"
                style={{
                  borderColor: n.realm === 'journal'
                    ? 'rgba(125, 212, 163, 0.3)'
                    : 'rgba(212, 165, 116, 0.3)',
                  background: 'rgba(0,0,0,0.2)',
                }}
              >
                <span style={{
                  color: n.realm === 'journal' ? '#7dd4a3' : '#d4a574',
                  fontSize: '10px',
                  fontFamily: 'Orbitron, monospace',
                  marginRight: '8px',
                }}>
                  {n.realm === 'journal' ? 'J' : 'P'}
                </span>
                <span style={{ color: 'var(--color-text)' }}>
                  {n.label}
                </span>
                <span style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: '11px',
                  marginLeft: '8px',
                }}>
                  {n.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
