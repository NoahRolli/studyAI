// MoodScaleLegend — Erklaert was die Mood-Scores bedeuten
// Farbcodierte Skala von 1 (schlecht) bis 10 (sehr gut)

import { useLanguage } from '../../hooks/useLanguage'

const SCALE: { min: number; max: number; color: string; de: string; en: string }[] = [
  { min: 1, max: 2, color: '#ff4444', de: 'Sehr schlecht', en: 'Very bad' },
  { min: 2, max: 4, color: '#ff8844', de: 'Schlecht', en: 'Bad' },
  { min: 4, max: 5, color: '#ffaa00', de: 'Unterdurchschnittlich', en: 'Below average' },
  { min: 5, max: 6, color: '#aabb44', de: 'Neutral', en: 'Neutral' },
  { min: 6, max: 7, color: '#66cc44', de: 'Gut', en: 'Good' },
  { min: 7, max: 9, color: '#44bb88', de: 'Sehr gut', en: 'Very good' },
  { min: 9, max: 10, color: '#00d4ff', de: 'Ausgezeichnet', en: 'Excellent' },
]

export function getScoreColor(score: number): string {
  const entry = SCALE.find(s => score >= s.min && score < s.max)
  return entry?.color || '#aabb44'
}

export function getScoreLabel(score: number, lang: string): string {
  const entry = SCALE.find(s => score >= s.min && score < s.max)
  return entry ? (lang === 'de' ? entry.de : entry.en) : ''
}

export default function MoodScaleLegend() {
  const { language } = useLanguage()

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs mr-1" style={{ color: 'var(--color-text-muted)' }}>
        {language === 'de' ? 'Skala:' : 'Scale:'}
      </span>
      {SCALE.map(s => (
        <span key={s.min} className="text-xs px-1.5 py-0.5 rounded"
          style={{ color: s.color, background: `${s.color}15` }}>
          {s.min}-{s.max} {language === 'de' ? s.de : s.en}
        </span>
      ))}
    </div>
  )
}
