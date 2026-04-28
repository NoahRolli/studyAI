// useSphereLayout — Laedt PCA-projizierte Cluster-Positionen vom Backend
// Endpoint: GET /api/concepts/sphere-layout
//
// Caching: einmal pro Session, manueller refresh moeglich
// Returns: { positions, folders, shellRadius, loading, error, refresh }

import { useState, useEffect, useCallback } from 'react'
import { get } from './useAPI'

export interface ClusterEdge {
  a: number
  b: number
  weight: number
}

export interface SphereLayoutData {
  cluster_positions: Record<string, [number, number, number]>
  cluster_folders: Record<string, number | null>
  shell_radius: number
  cluster_edges: ClusterEdge[]
  cluster_connectivity: Record<string, number>
}

export function useSphereLayout(enabled: boolean = true) {
  const [data, setData] = useState<SphereLayoutData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLayout = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await get<SphereLayoutData>('/api/concepts/sphere-layout')
      setData(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      console.error('Sphere layout load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled && !data && !loading) {
      fetchLayout()
    }
  }, [enabled, data, loading, fetchLayout])

  return {
    positions: data?.cluster_positions ?? null,
    folders: data?.cluster_folders ?? null,
    shellRadius: data?.shell_radius ?? null,
    edges: data?.cluster_edges ?? null,
    connectivity: data?.cluster_connectivity ?? null,
    loading,
    error,
    refresh: fetchLayout,
  }
}
