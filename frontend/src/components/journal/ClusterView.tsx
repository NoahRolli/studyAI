// ClusterView — Themen-Cluster Visualisierung
// Zeigt gruppierte Journal-Einträge nach thematischer Ähnlichkeit
// Ruft POST /api/journal/analytics/clusters auf
//
// Jeder Cluster hat ein AI-generiertes Label und eine Liste von Einträgen

import { useState, useEffect } from 'react'
import { post } from '../../hooks/useAPI'
import type { ClusterResult } from '../../types/models'

function ClusterView() {
  const [clusters, setClusters] = useState<ClusterResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cluster laden beim ersten Rendern
  useEffect(() => {
    loadClusters()
  }, [])

  async function loadClusters() {
    try {
      setLoading(true)
      setError(null)

      // POST /api/journal/analytics/clusters → Themen-Gruppen
      const data = await post<ClusterResult[]>('/api/journal/analytics/clusters')
      setClusters(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clustering fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  // --- Render ---

  if (loading) {
    return <p className="text-gray-400 text-sm">Themen werden analysiert...</p>
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  if (clusters.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Noch keine Cluster. Mindestens 2 Einträge nötig.
      </p>
    )
  }

  // Farben für Cluster-Karten (rotiert bei mehr als 5 Clustern)
  const colors = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171']

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Themen-Cluster</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clusters.map((cluster, index) => (
          <div
            key={cluster.cluster_id}
            className="bg-gray-900 border border-gray-800 rounded-lg p-5"
          >
            {/* Cluster-Header mit farbigem Punkt */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <h4 className="font-semibold">{cluster.label}</h4>
              <span className="text-xs text-gray-500 ml-auto">
                {cluster.entry_ids.length} Einträge
              </span>
            </div>

            {/* Titel der enthaltenen Einträge */}
            <ul className="space-y-1">
              {cluster.titles.map((title, i) => (
                <li
                  key={cluster.entry_ids[i]}
                  className="text-sm text-gray-400 pl-6 relative"
                >
                  <span
                    className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: colors[index % colors.length],
                      opacity: 0.5,
                    }}
                  />
                  {title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ClusterView