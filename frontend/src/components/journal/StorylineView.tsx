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
const ARC_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  rising: { label: 'Steigend', color: '#34d399', icon: '↗' },
  falling: { label: 'Abklingend', color: '#f87171', icon: '↘' },
  resolved: { label: 'Abgeschlossen', color: '#60a5fa', icon: '✓' },
  ongoing: { label: 'Offen', color: '#fbbf24', icon: '→' },
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

      // POST /api/journal/analytics/storylines → Narrative Bögen
      const data = await post<StorylineResult[]>(
        '/api/journal/analytics/storylines'
      )
      setStorylines(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Storyline-Analyse fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  // --- Render ---

  if (loading) {
    return <p className="text-gray-400 text-sm">Storylines werden erkannt...</p>
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  if (storylines.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Noch keine Storylines erkannt. Mindestens 3 Einträge nötig.
      </p>
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Storylines</h3>

      <div className="space-y-4">
        {storylines.map((story, index) => {
          const arc = ARC_CONFIG[story.arc_type] ?? ARC_CONFIG.ongoing

          return (
            <div
              key={index}
              className="bg-gray-900 border border-gray-800 rounded-lg p-5"
            >
              {/* Storyline-Header */}
              <div className="flex items-center gap-3 mb-3">
                {/* Arc-Icon mit Farbe */}
                <span
                  className="text-lg"
                  style={{ color: arc.color }}
                >
                  {arc.icon}
                </span>

                <h4 className="font-semibold">{story.title}</h4>

                {/* Arc-Badge */}
                <span
                  className="text-xs px-2 py-0.5 rounded-full ml-auto"
                  style={{
                    backgroundColor: arc.color + '20',
                    color: arc.color,
                  }}
                >
                  {arc.label}
                </span>
              </div>

              {/* Konfidenz-Balken */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-gray-500">Konfidenz</span>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${story.confidence * 100}%`,
                      backgroundColor: arc.color,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {Math.round(story.confidence * 100)}%
                </span>
              </div>

              {/* Anzahl verknüpfter Einträge */}
              <p className="text-xs text-gray-500">
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