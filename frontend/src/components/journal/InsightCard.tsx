// InsightCard — Ergebnis-Anzeige für eine einzelne Insight-Analyse
// Rendert je nach Typ (medication-mood, weekday-mood, etc.)
// unterschiedliche Visualisierungen mit HUD-Styling

import { useLanguage } from '../../hooks/useLanguage'
import type {
  MedMoodResult,
  WeekdayMoodResult,
  WritingResult,
  KeywordMoodResult,
} from './InsightsView'

interface InsightCardProps {
  type: string
  data: unknown
}

// Mood-Score → Farbe (rot negativ, grün positiv)
function moodColor(score: number): string {
  if (score > 0.3) return 'var(--color-success)'
  if (score < -0.3) return 'var(--color-danger)'
  return 'var(--color-warning)'
}

// Score als Balken-Breite (0-100%)
function moodWidth(score: number): number {
  return Math.round(((score + 1) / 2) * 100)
}

function InsightCard({ type, data }: InsightCardProps) {
  const { t } = useLanguage()

  // --- Medikament ↔ Stimmung ---
  if (type === 'medication-mood') {
    const items = data as MedMoodResult[]
    if (!items || items.length === 0) {
      return <EmptyState text={t.insights.noData} />
    }
    return (
      <div className="hud-card p-4 space-y-4">
        {items.map((item) => (
          <div key={item.medication}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium"
                style={{ color: 'var(--color-text-primary)' }}>
                {item.medication}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border"
                style={{
                  color: item.trend === 'positive' ? 'var(--color-success)'
                    : item.trend === 'negative' ? 'var(--color-danger)'
                    : 'var(--color-warning)',
                  borderColor: item.trend === 'positive' ? 'rgba(0,255,136,0.3)'
                    : item.trend === 'negative' ? 'rgba(255,59,92,0.3)'
                    : 'rgba(255,170,0,0.3)',
                  background: item.trend === 'positive' ? 'rgba(0,255,136,0.1)'
                    : item.trend === 'negative' ? 'rgba(255,59,92,0.1)'
                    : 'rgba(255,170,0,0.1)',
                }}>
                {item.difference > 0 ? '+' : ''}{item.difference}
              </span>
            </div>
            {/* Balken: mit vs. ohne */}
            <div className="space-y-1">
              <MoodBar
                label={`${t.insights.withMed} (${item.days_with} ${t.insights.days})`}
                score={item.avg_mood_with}
              />
              <MoodBar
                label={`${t.insights.withoutMed} (${item.days_without} ${t.insights.days})`}
                score={item.avg_mood_without}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // --- Wochentag ↔ Stimmung ---
  if (type === 'weekday-mood') {
    const items = data as WeekdayMoodResult[]
    if (!items || items.length === 0) {
      return <EmptyState text={t.insights.noData} />
    }
    return (
      <div className="hud-card p-4">
        <div className="space-y-2">
          {items.map((item) => (
            <MoodBar
              key={item.weekday}
              label={`${t.insights.weekdays[item.weekday_index]} (${item.entry_count}x)`}
              score={item.avg_mood}
            />
          ))}
        </div>
      </div>
    )
  }

  // --- Schreib-Muster ---
  if (type === 'writing-patterns') {
    const d = data as WritingResult
    if (!d || !d.total_entries) {
      return <EmptyState text={t.insights.noData} />
    }
    return (
      <div className="hud-card p-4 space-y-3">
        <StatRow label={t.insights.totalEntries} value={String(d.total_entries)} />
        <StatRow label={t.insights.writingDays} value={String(d.writing_days)} />
        <StatRow label={t.insights.avgLength} value={`${d.avg_length} ${t.insights.chars}`} />
        {d.avg_mood_writing_days !== null && (
          <StatRow
            label={t.insights.moodWriting}
            value={String(d.avg_mood_writing_days)}
            color={moodColor(d.avg_mood_writing_days)}
          />
        )}
        {d.avg_mood_silent_days !== null && (
          <StatRow
            label={t.insights.moodSilent}
            value={String(d.avg_mood_silent_days)}
            color={moodColor(d.avg_mood_silent_days)}
          />
        )}
      </div>
    )
  }

  // --- Themen ↔ Stimmung ---
  if (type === 'keyword-mood') {
    const items = data as KeywordMoodResult[]
    if (!items || items.length === 0) {
      return <EmptyState text={t.insights.noData} />
    }
    // Top 10 anzeigen
    const top = items.slice(0, 10)
    return (
      <div className="hud-card p-4">
        <div className="space-y-2">
          {top.map((item) => (
            <div key={item.keyword} className="flex items-center gap-3">
              <span className="text-xs w-24 truncate"
                style={{ color: 'var(--color-text-secondary)' }}>
                {item.keyword}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--color-bg-base)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${moodWidth(item.avg_mood)}%`,
                    backgroundColor: moodColor(item.avg_mood),
                    boxShadow: `0 0 6px ${moodColor(item.avg_mood)}60`,
                  }} />
              </div>
              <span className="text-xs w-12 text-right"
                style={{ color: moodColor(item.avg_mood) }}>
                {item.avg_mood > 0 ? '+' : ''}{item.avg_mood}
              </span>
              <span className="text-xs w-8 text-right"
                style={{ color: 'var(--color-text-muted)' }}>
                {item.count}x
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- AI-Summary ---
  if (type === 'ai-summary') {
    const d = data as { summary: string | null; error?: string }
    if (d.error || !d.summary) {
      return <EmptyState text={d.error || t.insights.noData} />
    }
    return (
      <div className="hud-card p-4">
        <p className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}>
          {d.summary}
        </p>
      </div>
    )
  }

  return null
}

// --- Hilfskomponenten ---

function MoodBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-32 truncate"
        style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-base)' }}>
        <div className="h-full rounded-full transition-all"
          style={{
            width: `${moodWidth(score)}%`,
            backgroundColor: moodColor(score),
            boxShadow: `0 0 6px ${moodColor(score)}60`,
          }} />
      </div>
      <span className="text-xs w-10 text-right"
        style={{ color: moodColor(score) }}>
        {score > 0 ? '+' : ''}{score}
      </span>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="text-sm font-medium"
        style={{ color: color || 'var(--color-text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="hud-card p-4">
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{text}</p>
    </div>
  )
}

export default InsightCard