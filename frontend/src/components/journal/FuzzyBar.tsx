// FuzzyBar — Visualisiert Fuzzy-Zugehörigkeiten als gestapelten Balken
// Jede Kategorie (sehr_schlecht bis sehr_gut) als farbiger Abschnitt
// Breite proportional zum Membership-Wert

import type { FuzzyMembership } from '../../types/models'

// Farben und Labels pro Fuzzy-Kategorie
export const FUZZY_CONFIG: Record<string, { color: string; de: string; en: string }> = {
  sehr_schlecht: { color: '#ef4444', de: 'Sehr schlecht', en: 'Very bad' },
  schlecht:      { color: '#f97316', de: 'Schlecht', en: 'Bad' },
  neutral:       { color: '#eab308', de: 'Neutral', en: 'Neutral' },
  gut:           { color: '#4ade80', de: 'Gut', en: 'Good' },
  sehr_gut:      { color: '#22d3ee', de: 'Sehr gut', en: 'Very good' },
}

// Reihenfolge der Kategorien (links→rechts)
const FUZZY_ORDER = ['sehr_schlecht', 'schlecht', 'neutral', 'gut', 'sehr_gut']

interface FuzzyBarProps {
  memberships: FuzzyMembership
  language?: string
  height?: string
}

export default function FuzzyBar({ memberships, language = 'de', height = 'h-3' }: FuzzyBarProps) {
  if (!memberships || Object.keys(memberships).length === 0) return null

  // Gesamtsumme für Normalisierung
  const total = FUZZY_ORDER.reduce((sum, key) => sum + (memberships[key] || 0), 0)
  if (total === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {/* Gestapelter Balken */}
      <div className={`flex ${height} rounded-full overflow-hidden`}
        style={{ backgroundColor: 'var(--color-bg-base)' }}>
        {FUZZY_ORDER.map(key => {
          const mu = memberships[key] || 0
          if (mu === 0) return null
          const pct = (mu / total) * 100
          const cfg = FUZZY_CONFIG[key]
          return (
            <div
              key={key}
              title={`${language === 'de' ? cfg.de : cfg.en}: ${mu}`}
              className="transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: cfg.color,
                boxShadow: `0 0 4px ${cfg.color}40`,
              }}
            />
          )
        })}
      </div>
      {/* Legende (nur Kategorien mit Wert) */}
      <div className="flex gap-2 flex-wrap">
        {FUZZY_ORDER.map(key => {
          const mu = memberships[key]
          if (!mu || mu < 0.05) return null
          const cfg = FUZZY_CONFIG[key]
          return (
            <span key={key} className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--color-text-muted)' }}>
              <span className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: cfg.color }} />
              {language === 'de' ? cfg.de : cfg.en}
            </span>
          )
        })}
      </div>
    </div>
  )
}
