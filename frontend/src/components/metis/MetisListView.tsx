// MetisListView — Cluster-Karten mit enthaltenen Nodes
// Zeigt AI-generierte Themengruppen als Karten.
// "Nicht zugeordnet"-Bereich für ungeclusterte Nodes.

import { useMemo } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type { MetisGraph } from '../../types/metis'

// Farben pro Node-Typ
const TYPE_COLORS = {
  note: '#7dd4a3',
  summary: '#d4a574',
}

interface Props {
  graph: MetisGraph
}

export default function MetisListView({ graph }: Props) {
  const { t } = useLanguage()

  // Nodes die keinem Cluster zugeordnet sind
  const unclustered = useMemo(() => {
    const clusteredIds = new Set(
      graph.clusters.flatMap(c => c.node_ids),
    )
    return graph.nodes.filter(n => !clusteredIds.has(n.id))
  }, [graph])

  return (
    <div className="p-4 overflow-y-auto h-full space-y-4">
      {/* Cluster-Karten */}
      {graph.clusters.map(cluster => {
        const members = graph.nodes.filter(
          n => cluster.node_ids.includes(n.id),
        )
        return (
          <div
            key={cluster.id}
            className="hud-card p-4"
            style={{
              borderColor: cluster.color || 'var(--color-border)',
              boxShadow: cluster.color
                ? `0 0 8px ${cluster.color}30`
                : undefined,
            }}
          >
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              {cluster.label}
            </h3>
            {cluster.description && (
              <p className="text-xs text-[var(--color-text-muted)] mb-3">
                {cluster.description}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {members.map(node => (
                <span
                  key={node.id}
                  className="
                    text-xs px-2 py-1 rounded
                    bg-[var(--color-bg-elevated)]
                    border border-[var(--color-border)]
                  "
                  style={{ borderColor: TYPE_COLORS[node.type] }}
                >
                  {node.title}
                </span>
              ))}
            </div>
          </div>
        )
      })}

      {/* Nicht zugeordnete Nodes */}
      {unclustered.length > 0 && (
        <div className="hud-card p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] mb-3">
            {t.metis.unclustered}
          </h3>
          <div className="flex flex-wrap gap-2">
            {unclustered.map(node => (
              <span
                key={node.id}
                className="
                  text-xs px-2 py-1 rounded
                  bg-[var(--color-bg-elevated)]
                  border border-[var(--color-border)]
                "
                style={{ borderColor: TYPE_COLORS[node.type] }}
              >
                {node.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leer-Zustand */}
      {graph.nodes.length === 0 && (
        <p className="text-center text-[var(--color-text-muted)] py-8">
          {t.metis.noNodes}
        </p>
      )}
    </div>
  )
}
