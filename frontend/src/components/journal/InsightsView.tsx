// InsightsView — Modulare Journal-Datenanalyse
// Zeigt auswählbare Analyse-Karten: Medikament↔Stimmung, Wochentage, etc.
// Daten kommen gecacht aus useJournalAnalytics (kein eigener State)
// Alle Daten bleiben lokal (Ollama-only für AI-Summary)

import { useLanguage } from '../../hooks/useLanguage'
import InsightCard from './InsightCard'
import type { InsightKey } from '../../hooks/useJournalAnalytics'

interface InsightsViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: Record<string, any>
  loading: Record<string, boolean>
  errors: Record<string, string>
  onLoadInsight: (key: InsightKey) => void
}

function InsightsView({ results, loading, errors, onLoadInsight }: InsightsViewProps) {
  const { t } = useLanguage()

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
              onClick={() => onLoadInsight(mod.key)}
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
