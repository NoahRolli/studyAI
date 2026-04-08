// ConceptListView — Liste aller Konzepte mit Quellen und Detail-Panel
// Zeigt Konzepte sortiert nach Quellen-Anzahl, aufklappbar.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { ConceptGraph, ConceptDetail } from '../../types/metis'

interface Props {
  graph: ConceptGraph
  onRefresh: () => void
}

export default function ConceptListView({ graph, onRefresh }: Props) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ConceptDetail | null>(null)
  const [loading, setLoading] = useState(false)

  // Sortiert nach Quellen-Anzahl (absteigend)
  const sorted = [...graph.nodes].sort(
    (a, b) => b.source_count - a.source_count
  )

  // Konzept aufklappen → Detail laden
  const handleExpand = useCallback(async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setLoading(true)
    try {
      const data = await get<ConceptDetail>(`/api/concepts/${id}`)
      setDetail(data)
    } catch (err) {
      console.error('Concept detail load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [expandedId])

  // Navigation zur Quelle
  const navigateToSource = (type: string, id: number) => {
    if (type === 'note') navigate(`/notes?open=${id}`)
    else if (type === 'summary') navigate(`/archiv`)
  }

  // Relationstyp-Farben
  const relColor = (type: string) => {
    if (type === 'builds_on') return 'var(--color-accent-cyan)'
    if (type === 'contradicts') return 'var(--color-accent-red, #ff4444)'
    if (type === 'part_of') return 'var(--color-accent-violet, #a855f7)'
    return 'var(--color-text-muted)'
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--color-text-muted)]">
          {t.metis?.noConcepts || 'Keine Konzepte. Starte einen Sync.'}
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 overflow-y-auto h-full space-y-2">
      {sorted.map(concept => (
        <div
          key={concept.id}
          className="border border-[var(--color-border)] rounded-lg overflow-hidden"
        >
          {/* Header — klickbar */}
          <button
            onClick={() => handleExpand(concept.id)}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--color-hover-bg)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {concept.name}
              </span>
              {concept.description && (
                <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[300px]">
                  {concept.description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">
                {concept.source_count} {concept.source_count === 1 ? 'Quelle' : 'Quellen'}
              </span>
              <span className="text-xs">{expandedId === concept.id ? '▲' : '▼'}</span>
            </div>
          </button>

          {/* Detail — aufklappbar */}
          {expandedId === concept.id && (
            <div className="border-t border-[var(--color-border)] p-3 space-y-3">
              {loading ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t.common.loading}
                </p>
              ) : detail ? (
                <>
                  {/* Quellen */}
                  {detail.sources.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                        Quellen
                      </p>
                      <div className="space-y-1">
                        {detail.sources.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => navigateToSource(s.type, s.id)}
                            className="flex items-center gap-2 text-xs hover:text-[var(--color-accent-cyan)] transition-colors"
                          >
                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase"
                              style={{
                                background: s.type === 'note'
                                  ? 'rgba(125, 212, 163, 0.15)'
                                  : 'rgba(212, 165, 116, 0.15)',
                                color: s.type === 'note' ? '#7dd4a3' : '#d4a574'
                              }}
                            >
                              {s.type}
                            </span>
                            <span>{s.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Verwandte Konzepte */}
                  {detail.related.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                        Verwandte Konzepte
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.related.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => handleExpand(r.id)}
                            className="text-xs px-2 py-1 rounded-full border transition-colors hover:bg-[var(--color-hover-bg)]"
                            style={{ borderColor: relColor(r.relation) }}
                          >
                            <span style={{ color: relColor(r.relation) }}>
                              {r.relation}
                            </span>
                            {' → '}{r.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
