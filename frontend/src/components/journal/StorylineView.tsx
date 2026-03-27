// StorylineView — Narrative Bögen über mehrere Einträge
// Zeigt erkannte Storylines mit Arc-Typ und Konfidenz
// Ruft POST /api/journal/analytics/storylines auf

import { useState, useEffect } from 'react'
import { post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { StorylineResult } from '../../types/models'

// Arc-Typ Konfiguration: Farbe + Icon (Label kommt aus i18n)
const ARC_CONFIG: Record<string, { color: string; icon: string }> = {
  rising:   { color: '#00ff88', icon: '↗' },
  falling:  { color: '#ff3b5c', icon: '↘' },
  resolved: { color: '#00d4ff', icon: '✓' },
  ongoing:  { color: '#ffaa00', icon: '→' },
}

function StorylineView() {
  const { t, language } = useLanguage()
  const [storylines, setStorylines] = useState<StorylineResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStorylines()
  }, [])

  async function loadStorylines() {
    try {
      setLoading(true)
      setError(null)
      const data = await post<StorylineResult[]>(`/api/journal/analytics/storylines?language=${language}`)
      setStorylines(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.storylineView.loading}
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

  if (storylines.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.storylineView.empty}
      </p>
    )
  }

  // Arc-Label aus i18n holen, Fallback auf Key
  function getArcLabel(arcType: string): string {
    const labels = t.storylineView.arcTypes as Record<string, string>
    return labels[arcType] ?? arcType
  }

  return (
    <div className="animate-fade-in">
      <h3
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {t.storylineView.title}
      </h3>

      <div className="space-y-4">
        {storylines.map((story, index) => {
          const arc = ARC_CONFIG[story.arc_type] ?? ARC_CONFIG.ongoing
          const arcLabel = getArcLabel(story.arc_type)

          return (
            <div key={index} className="hud-card p-5 animate-fade-in">
              {/* Storyline-Header */}
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="text-lg"
                  style={{
                    color: arc.color,
                    textShadow: `0 0 8px ${arc.color}80`,
                  }}
                >
                  {arc.icon}
                </span>
                <h4
                  className="font-semibold text-sm"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {story.title}
                </h4>
                <span
                  className="text-xs px-2 py-0.5 rounded-full ml-auto border"
                  style={{
                    backgroundColor: arc.color + '15',
                    color: arc.color,
                    borderColor: arc.color + '40',
                  }}
                >
                  {arcLabel}
                </span>
              </div>

              {/* Konfidenz-Balken */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t.storylineView.confidence}
                </span>
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--color-bg-base)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${story.confidence * 100}%`,
                      backgroundColor: arc.color,
                      boxShadow: `0 0 6px ${arc.color}60`,
                    }}
                  />
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {Math.round(story.confidence * 100)}%
                </span>
              </div>

              {/* Anzahl verknüpfter Einträge */}
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {story.entry_ids.length} {t.storylineView.linkedEntries}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StorylineView