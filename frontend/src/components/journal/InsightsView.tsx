// InsightsView — Modulare Journal-Datenanalyse
// Zeigt auswählbare Analyse-Karten: Medikament↔Stimmung, Wochentage, etc.
// Jede Analyse wird einzeln geladen wenn der User sie anklickt
// Alle Daten bleiben lokal (Ollama-only für AI-Summary)

import { useState } from 'react'
import { post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import InsightCard from './InsightCard'

// Typen für die verschiedenen Analysen
export interface MedMoodResult {
  medication: string
  avg_mood_with: number
  avg_mood_without: number
  difference: number
  days_with: number
  days_without: number
  trend: string
}

export interface WeekdayMoodResult {
  weekday: string
  weekday_index: number
  avg_mood: number
  entry_count: number
}

export interface WritingResult {
  total_entries: number
  avg_length: number
  avg_mood_writing_days: number | null
  avg_mood_silent_days: number | null
  writing_days: number
}

export interface KeywordMoodResult {
  keyword: string
  avg_mood: number
  count: number
}

// Analyse-Module die der User auswählen kann
type InsightKey = 'medication-mood' | 'weekday-mood' | 'writing-patterns' | 'keyword-mood' | 'ai-summary'

function InsightsView() {
  const { t, language } = useLanguage()

  // State pro Analyse-Modul
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Analyse laden
  async function loadInsight(key: InsightKey) {
    // Toggle: wenn schon geladen, zuklappen
    if (results[key] !== undefined) {
      setResults((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      return
    }

    try {
      setLoading((prev) => ({ ...prev, [key]: true }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      const data = await post(`/api/journal/insights/${key}?language=${language}`)
      setResults((prev) => ({ ...prev, [key]: data }))
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : t.common.error,
      }))
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  // Analyse-Module Konfiguration (keine Emojis — geometrische Symbole)
  const modules: { key: InsightKey; icon: string; title: string; desc: string }[] = [
    {
      key: 'medication-mood',
      icon: '⊕',
      title: t.insights.medMood,
      desc: t.insights.medMoodDesc,
    },
    {
      key: 'weekday-mood',
      icon: '▦',
      title: t.insights.weekdayMood,
      desc: t.insights.weekdayMoodDesc,
    },
    {
      key: 'writing-patterns',
      icon: '≡',
      title: t.insights.writingPatterns,
      desc: t.insights.writingPatternsDesc,
    },
    {
      key: 'keyword-mood',
      icon: '◈',
      title: t.insights.keywordMood,
      desc: t.insights.keywordMoodDesc,
    },
    {
      key: 'ai-summary',
      icon: '⟁',
      title: t.insights.aiSummary,
      desc: t.insights.aiSummaryDesc,
    },
  ]

  return (
    <div className="animate-fade-in">
      <h3
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {t.insights.title}
      </h3>
      <p className="text-xs mb-6" style={{ color: 'var(--color-text-muted)' }}>
        {t.insights.subtitle}
      </p>

      <div className="space-y-4">
        {modules.map((mod) => (
          <div key={mod.key}>
            {/* Analyse-Button-Karte */}
            <button
              onClick={() => loadInsight(mod.key)}
              disabled={loading[mod.key]}
              className="hud-card p-4 w-full text-left transition-all duration-200"
              style={{
                borderColor: results[mod.key]
                  ? 'rgba(0, 255, 255, 0.3)'
                  : undefined,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-lg"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {mod.icon}
                </span>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}>
                    {mod.title}
                  </h4>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {mod.desc}
                  </p>
                </div>
                {loading[mod.key] && (
                  <span className="text-xs" style={{ color: 'var(--color-primary)' }}>
                    {t.insights.analyzing}
                  </span>
                )}
                {results[mod.key] && !loading[mod.key] && (
                  <span className="text-xs" style={{ color: 'var(--color-primary)' }}>▼</span>
                )}
              </div>
            </button>

            {/* Fehler */}
            {errors[mod.key] && (
              <div className="mt-2 px-4 py-2 rounded text-xs border"
                style={{
                  background: 'rgba(255, 59, 92, 0.1)',
                  borderColor: 'rgba(255, 59, 92, 0.3)',
                  color: 'var(--color-danger)',
                }}>
                {errors[mod.key]}
              </div>
            )}

            {/* Ergebnis-Anzeige */}
            {results[mod.key] && !loading[mod.key] && (
              <div className="mt-2 animate-fade-in">
                <InsightCard type={mod.key} data={results[mod.key]} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default InsightsView