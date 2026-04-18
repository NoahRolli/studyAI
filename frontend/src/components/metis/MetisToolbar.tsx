// MetisToolbar — Steuerleiste fuer den Knowledge-Graph
// View-Toggle (3D/Liste), Action-Buttons mit Loading, Provider-Badge

import { useLanguage } from '../../hooks/useLanguage'
import type { MetisViewMode } from '../../types/metis'
import PageProviderBadge from '../PageProviderBadge'
import LoadingDot from '../LoadingDot'

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
    { key: '3d', label: t.metis.view3D },
    { key: 'list', label: t.metis.viewList },
    { key: 'graph', label: t.metis.viewGraph },
  ]

  const anyLoading = syncing || linking || clustering

  return (
    <div className="flex items-center gap-4">
      {/* Statistik */}
      <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
        <span>{nodeCount} {t.metis.nodes}</span>
        <span>{edgeCount} {t.metis.edges}</span>
        <span>{clusterCount} {t.metis.clusters}</span>
      </div>

      {/* View-Toggle */}
      <div
        className="flex rounded-md overflow-hidden"
        style={{ border: '1px solid var(--color-border)' }}
      >
        {views.map((v, i) => (
          <button
            key={v.key}
            onClick={() => onViewChange(v.key)}
            className="px-3 py-1.5 text-xs tracking-wider transition-all"
            style={{
              background: view === v.key
                ? 'var(--color-primary)' : 'transparent',
              color: view === v.key
                ? 'var(--color-bg-deep)' : 'var(--color-text-muted)',
              fontWeight: view === v.key ? 600 : 400,
              borderRight: i < views.length - 1
                ? '1px solid var(--color-border)' : 'none',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Action-Buttons */}
      <div className="flex gap-2">
        <button onClick={onSync}
          disabled={syncing || anyLoading}
          className="hud-btn"
          style={{ opacity: syncing ? 1 : anyLoading ? 0.4 : 1 }}>
          {syncing ? t.metis.syncing : t.metis.sync}
          <LoadingDot active={syncing} />
        </button>
        <button onClick={onAutoLink}
          disabled={linking || anyLoading || nodeCount < 2}
          className="hud-btn"
          style={{ opacity: linking ? 1 : anyLoading ? 0.4 : 1 }}>
          {linking ? t.metis.autoLinking : t.metis.autoLink}
          <LoadingDot active={linking} />
        </button>
        <button onClick={onAutoCluster}
          disabled={clustering || anyLoading || nodeCount < 3}
          className="hud-btn"
          style={{ opacity: clustering ? 1 : anyLoading ? 0.4 : 1 }}>
          {clustering ? t.metis.autoClustering : t.metis.autoCluster}
          <LoadingDot active={clustering} />
        </button>
      </div>

      {/* Provider Override Badge */}
      <PageProviderBadge page="metis" />
    </div>
  )
}
