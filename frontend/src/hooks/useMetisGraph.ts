// useMetisGraph — Datenlogik fuer den Metis Knowledge-Graph
// Laedt ConceptGraph, transformiert zu MetisGraph, steuert Aktionen
// Auto-Link + Auto-Cluster nutzen SSE-Streams fuer Live-Progress

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTasks } from '../context/TaskContext'
import { get, post } from './useAPI'
import type { ConceptGraph, MetisGraph } from '../types/metis'

// SSE-Helper: oeffnet EventSource, meldet Progress via updateDetail
//
// Backend-Events (nach Chat-65-Refactor):
// - status:    {batches, concepts, concurrency} — initialer Setup-Info
// - batch_done: {batch, done, total, clusters_in_batch, total_clusters,
//                created, provider, elapsed} — pro Batch fertig
// - batch_error: {batch, done, total, error} — Batch fehlgeschlagen, Run laeuft weiter
// - cancelled: {done, total, elapsed} — sauberer Cancel, alte Cluster intakt
// - complete:  {clusters, batches, total_concepts, elapsed} — Run durch
//
// done-Counter ist monoton (anders als batch-Index der bei Parallelisierung
// unsortiert kommen kann). Daher: done/total fuer Progress-Anzeige nutzen.
function connectSSE(
  url: string, taskId: string,
  updateDetail: (id: string, detail: string) => void,
  onComplete: () => void,
  onCancelled: () => void,
  onError: () => void,
): EventSource {
  const es = new EventSource(url)

  es.addEventListener('status', (e) => {
    const d = JSON.parse(e.data)
    const conc = d.concurrency ? ` (parallel: ${d.concurrency})` : ''
    updateDetail(taskId, `Starte ${d.batches} Batches${conc} ...`)
  })

  es.addEventListener('batch_done', (e) => {
    const d = JSON.parse(e.data)
    // done = monotoner Counter, batch = Original-Index (kann unsortiert sein)
    const progress = d.done != null ? `${d.done}/${d.total}` : `${d.batch}/${d.total}`
    const info = d.provider ? ` — ${d.provider}` : ''
    const created = d.created != null ? ` +${d.created}` : ''
    const clusters = d.clusters_in_batch != null ? ` +${d.clusters_in_batch} clusters` : ''
    updateDetail(taskId, `Batch ${progress}${info}${created}${clusters}`)
  })

  es.addEventListener('batch_error', (e) => {
    const d = JSON.parse(e.data)
    const progress = d.done != null ? `${d.done}/${d.total}` : `${d.batch}/${d.total}`
    updateDetail(taskId, `Batch ${progress} — Fehler (Run laeuft weiter)`)
  })

  es.addEventListener('cancelled', (e) => {
    const d = JSON.parse(e.data)
    const progress = d.done != null ? `${d.done}/${d.total}` : ''
    updateDetail(taskId, `Abgebrochen ${progress} — alte Cluster bleiben aktiv`)
    es.close()
    onCancelled()
  })

  es.addEventListener('complete', () => {
    es.close()
    onComplete()
  })

  es.onerror = () => {
    es.close()
    onError()
  }

  return es
}

export function useMetisGraph(minSourceCount: number = 2) {
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [loading, setLoading] = useState(true)
  const { tasks, runTask, updateDetail } = useTasks()
  const esRef = useRef<EventSource | null>(null)

  const syncing = tasks.some(t => t.id === 'metis-sync' && t.status === 'running')
  const linking = tasks.some(t => t.id === 'metis-link' && t.status === 'running')
  const clustering = tasks.some(t => t.id === 'metis-cluster' && t.status === 'running')

  // Cleanup bei Unmount
  useEffect(() => () => { esRef.current?.close() }, [])

  // Filter nach source_count — blendet Rauschen aus
  // (Konzepte mit wenig Quellen sind oft Einmal-Nennungen)
  const filteredGraph = useMemo<ConceptGraph>(() => {
    const visibleNodes = conceptGraph.nodes.filter(
      n => (n.source_count || 0) >= minSourceCount,
    )
    const visibleIds = new Set(visibleNodes.map(n => n.id))
    const visibleEdges = conceptGraph.edges.filter(
      e => visibleIds.has(e.source) && visibleIds.has(e.target),
    )
    const visibleClusters = conceptGraph.clusters
      .map(cl => ({ ...cl, node_ids: cl.node_ids.filter(id => visibleIds.has(id)) }))
      .filter(cl => cl.node_ids.length > 0)
    return {
      nodes: visibleNodes,
      edges: visibleEdges,
      clusters: visibleClusters,
      folders: conceptGraph.folders,
    }
  }, [conceptGraph, minSourceCount])

  const sphereGraph = useMemo<MetisGraph>(() => ({
    nodes: filteredGraph.nodes.map(c => ({
      id: c.id, type: 'note' as const, source_id: c.id,
      title: c.name, pos_x: null, pos_y: null,
      embedding_stale: false, cluster_ids: [], source_count: c.source_count,
      folder_id: c.folder_id, folder_name: c.folder_name,
    })),
    edges: filteredGraph.edges.map(e => ({
      id: e.id, source_node_id: e.source,
      target_node_id: e.target,
      relation_type: e.relation_type,
      strength: e.strength,
      status: e.status || 'suggested',
      reason: e.reason,
    })),
    clusters: filteredGraph.clusters.map(cl => ({
      id: cl.id, label: cl.label,
      description: cl.description,
      color: null, node_ids: cl.node_ids,
    })),
    folders: (filteredGraph.folders || []).map(f => ({ id: f.id, name: f.name })),
  }), [filteredGraph])

  const loadGraph = useCallback(async () => {
    try {
      const data = await get<ConceptGraph>('/api/concepts/graph?min_edge_strength=0.85')
      setConceptGraph(data)
    } catch (err) {
      console.error('Concept graph load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGraph() }, [loadGraph])

  // Sync — bleibt POST (schnell, kein AI-Call pro Item)
  const handleSync = useCallback(() => {
    runTask('metis-sync', 'Sync Concepts', async (signal) => {
      await post('/api/concepts/sync', undefined, signal)
      await loadGraph()
    })
  }, [runTask, loadGraph])

  // Auto-Link via SSE
  const handleAutoLink = useCallback(() => {
    runTask('metis-link', 'Detect Connections', async (signal) => {
      return new Promise<void>((resolve, reject) => {
        const es = connectSSE(
          '/api/concepts/auto-link/stream',
          'metis-link', updateDetail,
          () => { esRef.current = null; loadGraph(); resolve() },
          () => { esRef.current = null; loadGraph(); resolve() },  // cancelled = ok, alte Daten intakt
          () => { esRef.current = null; loadGraph(); reject(new Error('Connection lost')) },
        )
        esRef.current = es
        signal.addEventListener('abort', () => { es.close(); esRef.current = null; loadGraph(); resolve() })
      })
    })
  }, [runTask, updateDetail, loadGraph])

  // Auto-Cluster via SSE
  const handleAutoCluster = useCallback(() => {
    runTask('metis-cluster', 'Group Topics', async (signal) => {
      return new Promise<void>((resolve, reject) => {
        const es = connectSSE(
          '/api/concepts/auto-cluster/stream',
          'metis-cluster', updateDetail,
          () => { esRef.current = null; loadGraph(); resolve() },
          () => { esRef.current = null; loadGraph(); resolve() },  // cancelled = ok, alte Daten intakt
          () => { esRef.current = null; loadGraph(); reject(new Error('Connection lost')) },
        )
        esRef.current = es
        signal.addEventListener('abort', () => { es.close(); esRef.current = null; loadGraph(); resolve() })
      })
    })
  }, [runTask, updateDetail, loadGraph])

  return {
    conceptGraph, filteredGraph, sphereGraph, loading, loadGraph,
    syncing, linking, clustering,
    handleSync, handleAutoLink, handleAutoCluster,
  }
}
