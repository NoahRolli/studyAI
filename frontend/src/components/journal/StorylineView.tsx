// StorylineView — Narrative Bögen über mehrere Einträge
// Zeigt erkannte Storylines mit Arc-Typ und Konfidenz
// Ruft POST /api/journal/analytics/storylines auf
//
// Arc-Typen: rising (steigend), falling (abklingend),
// resolved (abgeschlossen), ongoing (offen)

import { useState, useEffect } from 'react'
import { post } from '../../hooks/useAPI'
import type { StorylineResult } from '../../types/models'

// Arc-Typ Konfiguration: Label, Farbe, Icon
// Farben passend zum HUD-Theme
const ARC_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  rising:   { label: 'Steigend',       color: '#00ff88', icon: '↗' },
  falling:  { label: 'Abklingend',     color: '#ff3b5c', icon: '↘' },
  resolved: { label: 'Abgeschlossen',  color: '#00d4ff', icon: '✓' },
  ongoing:  { label: 'Offen',          color: '#ffaa00', icon: '→' },
}

function StorylineView() {
  const [storylines, setStorylines] = useState<StorylineResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Storylines laden beim ersten Rendern
  useEffect(() => {
    loadStorylines()
  }, [])

  async function loadStorylines() {
    try {
      setLoading(true)
      setError(null)
      const data = await post<StorylineResult[]>('/api/journal/analytics/storylines')
      setStorylines(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Storyline-Analyse fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  // --- Render ---
  if (loading) {
    return <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">Storylines werden erkannt...</p>
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
        Noch keine Storylines erkannt. Mindestens 3 Einträge nötig.
      </p>
    )
  }

  return (
    <div className="animate-fade-in">
      <h3
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        Storylines
      </h3>

      <div className="space-y-4">
        {storylines.map((story, index) => {
          const arc = ARC_CONFIG[story.arc_type] ?? ARC_CONFIG.ongoing

          return (
            <div key={index} className="hud-card p-5 animate-fade-in">
              {/* Storyline-Header */}
              <div className="flex items-center gap-3 mb-3">
                {/* Arc-Icon mit Glow */}
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

                {/* Arc-Badge */}
                <span
                  className="text-xs px-2 py-0.5 rounded-full ml-auto border"
                  style={{
                    backgroundColor: arc.color + '15',
                    color: arc.color,
                    borderColor: arc.color + '40',
                  }}
                >
                  {arc.label}
                </span>
              </div>

              {/* Konfidenz-Balken */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Konfidenz
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
                {story.entry_ids.length} verknüpfte Einträge
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StorylineView