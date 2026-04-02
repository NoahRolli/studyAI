// ClusterView — Themen-Cluster Visualisierung + Mindmap-Button
// Zeigt gruppierte Journal-Einträge nach thematischer Ähnlichkeit
// Daten kommen gecacht aus useJournalAnalytics (kein eigener State)
// Button oben navigiert zur Fullscreen Journal-Mindmap

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'
import type { ClusterResult } from '../../types/models'

// Cluster-Farben — Cyan-Palette passend zum HUD-Theme
const CLUSTER_COLORS = ['#00d4ff', '#a78bfa', '#00ff88', '#ffaa00', '#ff3b5c']

interface ClusterViewProps {
  clusters: ClusterResult[]
  loading: boolean
  error: string | null
  onLoad: () => void
}

function ClusterView({ clusters, loading, error, onLoad }: ClusterViewProps) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  // Beim ersten Rendern laden (Cache-Check passiert im Hook)
  useEffect(() => { onLoad() }, [])

  if (loading) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.clusterView.loading}
      </p>
    )
  }

  if (error) {
    return (
      <div
        className="px-4 py-3 rounded-lg text-sm border"
        style={{
          background: 'rgba(255, 59, 92, 0.1)',
          borderColor: 'rgba(255, 59, 92, 0.3)',
          color: 'var(--color-danger)',
        }}
      >
        {error}
      </div>
    )
  }

  if (clusters.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.clusterView.empty}
      </p>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header mit Mindmap-Button */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="hud-title text-sm"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.clusterView.title}
        </h3>
        <button
          onClick={() => navigate('/journal/mindmap')}
          className="hud-btn text-xs"
        >
          {t.clusterView.openMindmap}
        </button>
      </div>

      {/* Cluster-Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clusters.map((cluster, index) => {
          const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length]
          return (
            <div key={cluster.cluster_id} className="hud-card p-5 animate-fade-in">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}60`,
                  }}
                />
                <h4
                  className="font-semibold text-sm"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {cluster.label}
                </h4>
                <span
                  className="text-xs ml-auto"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {cluster.entry_ids.length} {t.clusterView.entries}
                </span>
              </div>
              <ul className="space-y-1">
                {cluster.titles.map((title, i) => (
                  <li
                    key={cluster.entry_ids[i]}
                    className="text-sm pl-6 relative"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <span
                      className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color, opacity: 0.5 }}
                    />
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ClusterView
