// MetisToolbar — Steuerleiste für den Knowledge-Graph
// Sync, Auto-Link, Auto-Cluster Buttons + View-Toggle + Statistik.

import { useLanguage } from '../../hooks/useLanguage'
import type { MetisViewMode } from '../../types/metis'

interface Props {
  view: MetisViewMode
  onViewChange: (v: MetisViewMode) => void
  onSync: () => void
  onAutoLink: () => void
  onAutoCluster: () => void
  syncing: boolean
  linking: boolean
  clustering: boolean
  nodeCount: number
  edgeCount: number
  clusterCount: number
}

export default function MetisToolbar({
  view, onViewChange, onSync, onAutoLink, onAutoCluster,
  syncing, linking, clustering,
  nodeCount, edgeCount, clusterCount,
}: Props) {
  const { t } = useLanguage()

  const views: { key: MetisViewMode; label: string }[] = [
    { key: '2d', label: t.metis.view2D },
    { key: '3d', label: t.metis.view3D },
    { key: 'list', label: t.metis.viewList },
  ]

  return (
    <div className="flex items-center gap-4">
      {/* Statistik */}
      <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
        <span>{nodeCount} {t.metis.nodes}</span>
        <span>{edgeCount} {t.metis.edges}</span>
        <span>{clusterCount} {t.metis.clusters}</span>
      </div>

      {/* View-Toggle */}
      <div className="flex gap-1">
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => onViewChange(v.key)}
            className={view === v.key ? 'hud-tab-active' : 'hud-tab'}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Action-Buttons */}
      <div className="flex gap-2">
        <button onClick={onSync} disabled={syncing} className="hud-btn">
          {syncing ? t.metis.syncing : t.metis.sync}
        </button>
        <button
          onClick={onAutoLink}
          disabled={linking || nodeCount < 2}
          className="hud-btn"
        >
          {linking ? t.metis.autoLinking : t.metis.autoLink}
        </button>
        <button
          onClick={onAutoCluster}
          disabled={clustering || nodeCount < 3}
          className="hud-btn"
        >
          {clustering ? t.metis.autoClustering : t.metis.autoCluster}
        </button>
      </div>
    </div>
  )
}
