// MetisToolbar — Steuerleiste für den Knowledge-Graph
// Sync-Button, View-Toggle (2D/3D/Liste), Statistik-Anzeige.
// AI-Buttons (Auto-Link, Auto-Cluster) werden in Phase 3 ergänzt.

import { useLanguage } from '../../hooks/useLanguage'
import type { MetisViewMode } from '../../types/metis'

interface Props {
  view: MetisViewMode
  onViewChange: (v: MetisViewMode) => void
  onSync: () => void
  syncing: boolean
  nodeCount: number
  edgeCount: number
  clusterCount: number
}

export default function MetisToolbar({
  view, onViewChange, onSync, syncing,
  nodeCount, edgeCount, clusterCount,
}: Props) {
  const { t } = useLanguage()

  // View-Toggle Buttons — aktiver Tab bekommt hud-tab-active
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

      {/* Sync-Button */}
      <button
        onClick={onSync}
        disabled={syncing}
        className="hud-btn-primary"
      >
        {syncing ? t.metis.syncing : t.metis.sync}
      </button>
    </div>
  )
}
