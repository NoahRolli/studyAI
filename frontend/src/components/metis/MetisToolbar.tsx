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

  // View-Toggle Optionen
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

      {/* View-Toggle — alle als einheitliche Button-Gruppe */}
      <div
        className="flex rounded overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => onViewChange(v.key)}
            className="px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: view === v.key
                ? 'var(--color-primary)'
                : 'var(--color-bg-surface)',
              color: view === v.key
                ? 'var(--color-bg-deep)'
                : 'var(--color-text-secondary)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Sync-Button */}
      <button
        onClick={onSync}
        disabled={syncing}
        className="hud-btn-primary px-4 py-1.5 text-xs"
      >
        {syncing ? t.metis.syncing : t.metis.sync}
      </button>
    </div>
  )
}
