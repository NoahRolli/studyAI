// StructuralGaps — Luecken im Wissens-Graph visualisieren
// Drei Bereiche: Isolierte Konzepte, Hub-Kandidaten, Unverbundene Cluster
// Rein lesend, keine AI-Calls

import { useState, useEffect, useCallback } from 'react'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

interface IsolatedConcept {
  id: number; name: string; source_count: number
  edge_count: number; description: string | null
}
interface HubCandidate {
  id: number; name: string; source_count: number
  edge_count: number; gap_ratio: number
}
interface ClusterInfo { id: number; label: string; size: number }
interface BridgeSuggestion {
  from: { id: number; name: string }
  to: { id: number; name: string }
}
interface DisconnectedPair {
  cluster_a: ClusterInfo; cluster_b: ClusterInfo
  suggestion: BridgeSuggestion
}
interface GapStats {
  total_concepts: number; total_edges: number; total_clusters: number
  isolated_count: number; hub_count: number; disconnected_count: number
}
interface GapData {
  isolated: IsolatedConcept[]; hub_candidates: HubCandidate[]
  disconnected_clusters: DisconnectedPair[]; stats: GapStats
}

export default function StructuralGaps() {
  const { language } = useLanguage()
  const [data, setData] = useState<GapData | null>(null)
  const [loading, setLoading] = useState(false)
  const de = language === 'de'

  const analyze = useCallback(async () => {
    setLoading(true)
    try {
      const result = await get<GapData>('/api/concepts/structural-gaps')
      setData(result)
    } catch (err) {
      console.error('Gap-Analyse fehlgeschlagen:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { analyze() }, [analyze])

  if (loading) return (
    <p className="text-xs py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
      {de ? 'Analysiere...' : 'Analyzing...'}
    </p>
  )
  if (!data) return null

  const { stats } = data
  const hasGaps = stats.isolated_count > 0 || stats.hub_count > 0 || stats.disconnected_count > 0

  return (
    <div>
      {/* Stats-Zeile */}
      <div className="flex flex-wrap gap-4 mb-5">
        {[
          { label: de ? 'Konzepte' : 'Concepts', val: stats.total_concepts },
          { label: 'Edges', val: stats.total_edges },
          { label: 'Cluster', val: stats.total_clusters },
          { label: de ? 'Isoliert' : 'Isolated', val: stats.isolated_count,
            color: stats.isolated_count > 0 ? 'var(--color-warning)' : undefined },
          { label: 'Hubs', val: stats.hub_count,
            color: stats.hub_count > 0 ? 'var(--color-primary)' : undefined },
          { label: de ? 'Getrennt' : 'Disconnected', val: stats.disconnected_count,
            color: stats.disconnected_count > 0 ? 'var(--color-danger)' : undefined },
        ].map(s => (
          <div key={s.label} className="text-center">
            <p className="text-lg font-mono" style={{ color: s.color || 'var(--color-text-primary)' }}>
              {s.val}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {!hasGaps && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--color-success)' }}>
            {de ? 'Keine strukturellen Lücken gefunden' : 'No structural gaps found'}
          </p>
        </div>
      )}

      {/* Isolierte Konzepte */}
      {data.isolated.length > 0 && (
        <Section title={de ? 'Isolierte Konzepte' : 'Isolated Concepts'}
          subtitle={de
            ? 'Konzepte mit Quellen aber wenigen/keinen Verbindungen'
            : 'Concepts with sources but few/no connections'}>
          <div className="space-y-1.5">
            {data.isolated.slice(0, 15).map(c => (
              <div key={c.id} className="hud-card p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm" style={{ color: 'var(--color-warning)' }}>
                    {c.name}
                  </span>
                  <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
                    {c.source_count} {de ? 'Quellen' : 'sources'}, {c.edge_count} edges
                  </span>
                </div>
              </div>
            ))}
            {data.isolated.length > 15 && (
              <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                +{data.isolated.length - 15} {de ? 'weitere' : 'more'}
              </p>
            )}
          </div>
        </Section>
      )}

      {/* Hub-Kandidaten */}
      {data.hub_candidates.length > 0 && (
        <Section title={de ? 'Hub-Kandidaten' : 'Hub Candidates'}
          subtitle={de
            ? 'Viele Quellen, wenige Verbindungen — sollten stärker vernetzt sein'
            : 'Many sources, few connections — should be better connected'}>
          <div className="space-y-1.5">
            {data.hub_candidates.slice(0, 10).map(c => (
              <div key={c.id} className="hud-card p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm" style={{ color: 'var(--color-primary)' }}>
                    {c.name}
                  </span>
                  <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
                    {c.source_count} {de ? 'Quellen' : 'sources'} / {c.edge_count} edges
                  </span>
                </div>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--color-primary)', background: 'rgba(0,212,255,0.08)' }}>
                  {c.gap_ratio}x
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Unverbundene Cluster */}
      {data.disconnected_clusters.length > 0 && (
        <Section title={de ? 'Getrennte Cluster' : 'Disconnected Clusters'}
          subtitle={de
            ? 'Cluster-Paare ohne Verbindung — mögliche Brücken'
            : 'Cluster pairs without connections — possible bridges'}>
          <div className="space-y-2">
            {data.disconnected_clusters.slice(0, 10).map((pair, i) => (
              <div key={i} className="hud-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
                    {pair.cluster_a.label}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    ({pair.cluster_a.size})
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    ↔
                  </span>
                  <span className="text-sm" style={{ color: 'var(--color-danger)' }}>
                    {pair.cluster_b.label}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    ({pair.cluster_b.size})
                  </span>
                </div>
                {pair.suggestion?.from && (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {de ? 'Brücke:' : 'Bridge:'}{' '}
                    <span style={{ color: 'var(--color-primary)' }}>
                      {pair.suggestion.from.name}
                    </span>
                    {' → '}
                    <span style={{ color: 'var(--color-primary)' }}>
                      {pair.suggestion.to.name}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Rescan */}
      <div className="text-center mt-4">
        <button onClick={analyze} disabled={loading} className="hud-btn-sm">
          {de ? 'Erneut analysieren' : 'Reanalyze'}
        </button>
      </div>
    </div>
  )
}

// Wiederverwendbare Section mit Titel
function Section({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-0.5" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
      {children}
    </div>
  )
}
