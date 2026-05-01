// TopicsView — Themen-Cluster Visualisierung mit Threshold-Slider + Recompute
// Loest ClusterView ab — basiert auf neuer Topics-Pipeline (bge-m3 Embeddings)
// Daten kommen gecacht aus useJournalAnalytics
//
// UI-Komponenten:
// - Threshold-Slider (0.40-0.85, Default 0.65) im localStorage persistiert
// - "Neu berechnen"-Button triggert Full-Recluster + Re-Label
// - Cards zeigen: Label, avg_mood (signed/farbig), entry-count, cohesion-bar, member-titles

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../hooks/useLanguage'
import type { TopicsOverview } from '../../types/models'

// Cluster-Farben — Cyan-Palette passend zum HUD-Theme (analog ClusterView)
const CLUSTER_COLORS = ['#00d4ff', '#a78bfa', '#00ff88', '#ffaa00', '#ff3b5c']

// localStorage-Key fuer persistierten Threshold
const THRESHOLD_KEY = 'pallas-journal-topic-threshold'
const DEFAULT_THRESHOLD = 0.65

interface TopicsViewProps {
  overview: TopicsOverview | null
  loading: boolean
  recomputing: boolean
  error: string | null
  onLoad: () => void
  onRecompute: (threshold: number) => void
}

function TopicsView({
  overview,
  loading,
  recomputing,
  error,
  onLoad,
  onRecompute,
}: TopicsViewProps) {
  const navigate = useNavigate()
  const { t } = useLanguage()

  // Threshold-State mit localStorage-Persistenz
  const [threshold, setThreshold] = useState<number>(() => {
    const stored = localStorage.getItem(THRESHOLD_KEY)
    if (stored === null) return DEFAULT_THRESHOLD
    const parsed = parseFloat(stored)
    return isNaN(parsed) ? DEFAULT_THRESHOLD : parsed
  })

  // Beim ersten Rendern Topics laden (Cache-Check passiert im Hook)
  useEffect(() => {
    onLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleThresholdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = parseFloat(e.target.value)
    setThreshold(value)
    localStorage.setItem(THRESHOLD_KEY, value.toString())
  }

  function handleRecompute() {
    onRecompute(threshold)
  }

  // === Loading State ===
  if (loading && !overview) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.topicsView.loading}
      </p>
    )
  }

  // === Error State ===
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

  const topics = overview?.topics ?? []

  return (
    <div className="animate-fade-in">
      {/* Header: Title + Mindmap-Button */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="hud-title text-sm"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.topicsView.title}
        </h3>
        <button
          onClick={() => navigate('/journal/mindmap')}
          className="hud-btn text-xs"
        >
          {t.topicsView.openMindmap}
        </button>
      </div>

      {/* Threshold-Control + Recompute */}
      <div className="hud-card p-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-64">
          <label
            className="text-xs block mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t.topicsView.thresholdLabel}: <span style={{ color: 'var(--color-primary)' }}>{threshold.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min={0.40}
            max={0.85}
            step={0.01}
            value={threshold}
            onChange={handleThresholdChange}
            disabled={recomputing}
            className="w-full"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <span>0.40 ({t.topicsView.thresholdLoose})</span>
            <span>0.85 ({t.topicsView.thresholdTight})</span>
          </div>
        </div>
        <button
          onClick={handleRecompute}
          disabled={recomputing}
          className="hud-btn text-xs whitespace-nowrap"
          style={{
            opacity: recomputing ? 0.5 : 1,
            cursor: recomputing ? 'wait' : 'pointer',
          }}
        >
          {recomputing ? t.topicsView.recomputing : t.topicsView.recompute}
        </button>
      </div>

      {/* Stats-Zeile */}
      {overview && (
        <div className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          {overview.clustered_entries} / {overview.total_entries} {t.topicsView.entriesClustered}
          {overview.orphan_count > 0 && (
            <span> · {overview.orphan_count} {t.topicsView.orphans}</span>
          )}
        </div>
      )}

      {/* Empty State */}
      {topics.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
          {t.topicsView.empty}
        </p>
      ) : (
        /* Topics-Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topics.map((topic, index) => {
            const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length]
            const realCount = topic.member_entry_ids.length
            const moodColor = getMoodColor(topic.avg_mood)
            const moodText = formatMood(topic.avg_mood)

            return (
              <div
                key={topic.cluster_id}
                className="hud-card p-5 animate-fade-in"
              >
                {/* Header: Bullet + Label + Mood + Count */}
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 8px ${color}60`,
                    }}
                  />
                  <h4
                    className="font-semibold text-sm flex-1 truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {topic.label ?? t.topicsView.unlabeled}
                  </h4>
                  {moodText && (
                    <span
                      className="text-xs font-mono shrink-0"
                      style={{ color: moodColor }}
                      title={`avg_mood: ${topic.avg_mood?.toFixed(3)}`}
                    >
                      {moodText}
                    </span>
                  )}
                  <span
                    className="text-xs shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {realCount} {t.topicsView.entries}
                  </span>
                </div>

                {/* Cohesion-Bar */}
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="text-xs shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {t.topicsView.cohesion}
                  </span>
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, topic.cohesion * 100)}%`,
                        background: color,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span
                    className="text-xs font-mono shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {(topic.cohesion * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Member-Titles */}
                <ul className="space-y-1">
                  {topic.member_titles.map((title, i) => (
                    <li
                      key={topic.member_entry_ids[i]}
                      className="text-sm pl-6 relative"
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontWeight:
                          topic.member_entry_ids[i] === topic.core_entry_id
                            ? 600
                            : 400,
                      }}
                    >
                      <span
                        className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: color, opacity: 0.5 }}
                      />
                      {title || t.topicsView.untitled}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// === Helpers ===

// Mood-Wert formatieren: signed mit 2 Decimals, oder null
function formatMood(mood: number | null): string | null {
  if (mood === null) return null
  const sign = mood >= 0 ? '+' : ''
  return `${sign}${mood.toFixed(2)}`
}

// Farbe basierend auf Mood-Wert: rot (negativ), grau (neutral), gruen (positiv)
function getMoodColor(mood: number | null): string {
  if (mood === null) return 'var(--color-text-muted)'
  if (mood > 0.15) return '#00ff88'
  if (mood < -0.15) return '#ff3b5c'
  return 'var(--color-text-muted)'
}

export default TopicsView
