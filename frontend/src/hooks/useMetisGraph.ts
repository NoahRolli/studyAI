// useMetisGraph — Datenlogik fuer den Metis Knowledge-Graph
// Laedt ConceptGraph, transformiert zu MetisGraph, steuert Aktionen

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTasks } from '../context/TaskContext'
import { get, post } from './useAPI'
import type { ConceptGraph, MetisGraph } from '../types/metis'

export function useMetisGraph() {
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph>({
    nodes: [], edges: [], clusters: [],
  })
  const [loading, setLoading] = useState(true)
  const { tasks, runTask } = useTasks()

  // Task-Status aus globalem TaskContext
  const syncing = tasks.some(t => t.id === 'metis-sync' && t.status === 'running')
  const linking = tasks.some(t => t.id === 'metis-link' && t.status === 'running')
  const clustering = tasks.some(t => t.id === 'metis-cluster' && t.status === 'running')

  // Konzept-Graph als MetisGraph-Format (fuer Sphaere)
  const sphereGraph = useMemo<MetisGraph>(() => ({
    nodes: conceptGraph.nodes.map(c => ({
      id: c.id, type: 'note' as const, source_id: c.id,
      title: c.name, pos_x: null, pos_y: null,
      embedding_stale: false, cluster_ids: [], source_count: c.source_count,
      folder_id: c.folder_id, folder_name: c.folder_name,
    })),
    edges: conceptGraph.edges.map(e => ({
      id: e.id, source_node_id: e.source,
      target_node_id: e.target,
      relation_type: e.relation_type,
      strength: e.strength,
      status: e.status || 'suggested',
      reason: e.reason,
    })),
    clusters: conceptGraph.clusters.map(cl => ({
      id: cl.id, label: cl.label,
      description: cl.description,
      color: null, node_ids: cl.node_ids,
    })),
    folders: (conceptGraph.folders || []).map(f => ({ id: f.id, name: f.name })),
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
  const handleSync = useCallback(() => {
    runTask('metis-sync', 'Sync Concepts', async (signal) => {
      await post('/api/concepts/sync', undefined, signal)
      await loadGraph()
    })
  }, [runTask, loadGraph])

  // Auto-Link — AI schlaegt Relationen vor
  const handleAutoLink = useCallback(() => {
    runTask('metis-link', 'Detect Connections', async (signal) => {
      await post('/api/concepts/auto-link', undefined, signal)
      await loadGraph()
    })
  }, [runTask, loadGraph])

  // Auto-Cluster — AI gruppiert Konzepte thematisch
  const handleAutoCluster = useCallback(() => {
    runTask('metis-cluster', 'Group Topics', async (signal) => {
      await post('/api/concepts/auto-cluster', undefined, signal)
      await loadGraph()
    })
  }, [runTask, loadGraph])

  return {
    conceptGraph, sphereGraph, loading, loadGraph,
    syncing, linking, clustering,
    handleSync, handleAutoLink, handleAutoCluster,
  }
}
