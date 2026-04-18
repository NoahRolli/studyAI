// SportCorrelationCard — Visualisierung der Sport ↔ Mood/Body-Korrelation
// Drei Blöcke: Same-Day-Effekt, nach Intensität, Lag-Effekt (Tag nach Sport)
// Kennzahlen: Mean, n, Cohen's d mit Effekt-Label (klein/mittel/gross)
// Passt sich an fehlende Daten an (n zu klein → d = null → "insufficient")

import { useLanguage } from '../../hooks/useLanguage'

// Datenstruktur — matcht das Backend-Response-Schema (compute_correlation)
interface GroupStats {
  mean: number | null
  n: number
  sd: number | null
}

interface Compare {
  group_a: GroupStats
  group_b: GroupStats
  delta: number | null
  cohens_d: number | null
  effect: 'none' | 'small' | 'medium' | 'large' | 'insufficient'
}

interface SportCorrelationData {
  range: { start: string; end: string; days: number }
  coverage: { sport_days: number; mood_days: number; body_days: number }
  same_day: { mood: Compare; body: Compare }
  by_intensity: {
    mood: Record<'low' | 'mid' | 'high', GroupStats>
    body: Record<'low' | 'mid' | 'high', GroupStats>
  }
  lag_next_day: { mood: Compare; body: Compare }
}

interface Props {
  data: SportCorrelationData
}

function SportCorrelationCard({ data }: Props) {
  const { t } = useLanguage()
  const s = t.insights.sportCorr

  return (
    <div className="hud-card p-4 space-y-5">
      {/* Header mit Zeitraum und Coverage */}
      <div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {s.range}: {data.range.start} → {data.range.end} ({data.range.days} {s.daysLabel})
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {s.coverage}: {data.coverage.sport_days} {s.sportDays} · {data.coverage.mood_days} {s.moodDays} · {data.coverage.body_days} {s.bodyDays}
        </div>
        {_thinDataHint(data, s)}
      </div>

      {/* Block 1: Same Day — Sport vs Ruhe */}
      <CompareBlock title={s.sameDayTitle} compare={data.same_day} s={s} />

      {/* Block 2: Nach Intensität */}
      <IntensityBlock
        title={s.byIntensityTitle}
        mood={data.by_intensity.mood}
        body={data.by_intensity.body}
        s={s}
      />

      {/* Block 3: Lag (Tag nach Sport) */}
      <CompareBlock title={s.lagTitle} compare={data.lag_next_day} s={s} />

      <div className="text-xs pt-2 border-t" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
        {s.note}
      </div>
    </div>
  )
}

// Mood + Body Vergleich in einem Block
function CompareBlock({ title, compare, s }: { title: string; compare: { mood: Compare; body: Compare }; s: Record<string, string> }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
        {title}
      </h4>
      <CompareRow label={s.mood} cmp={compare.mood} s={s} />
      <div className="mt-2" />
      <CompareRow label={s.body} cmp={compare.body} s={s} />
    </div>
  )
}

// Eine Zeile: Gruppe A vs Gruppe B + Delta + Effekt
function CompareRow({ label, cmp, s }: { label: string; cmp: Compare; s: Record<string, string> }) {
  const a = cmp.group_a
  const b = cmp.group_b
  return (
    <div className="pl-2 space-y-1" style={{ borderLeft: '2px solid var(--color-border)' }}>
      <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {label}
      </div>
      <Row name={s.groupSport} stats={a} />
      <Row name={s.groupRest} stats={b} />
      <EffectLine delta={cmp.delta} d={cmp.cohens_d} effect={cmp.effect} s={s} />
    </div>
  )
}

function Row({ name, stats }: { name: string; stats: GroupStats }) {
  const mean = stats.mean !== null ? stats.mean.toFixed(1) : '—'
  return (
    <div className="flex items-center justify-between text-xs pl-2">
      <span style={{ color: 'var(--color-text-muted)' }}>{name}</span>
      <span style={{ color: 'var(--color-text-primary)' }}>
        {mean} <span style={{ color: 'var(--color-text-muted)' }}>(n={stats.n})</span>
      </span>
    </div>
  )
}

function EffectLine({ delta, d, effect, s }: { delta: number | null; d: number | null; effect: string; s: Record<string, string> }) {
  if (delta === null) {
    return (
      <div className="text-xs pl-2" style={{ color: 'var(--color-text-muted)' }}>
        {s.insufficient}
      </div>
    )
  }
  const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1)
  const dStr = d !== null ? `d=${d.toFixed(2)}` : s.dUnavailable
  const effectLabel = s['effect_' + effect] || effect
  const effectColor =
    effect === 'large' ? 'var(--color-primary)' :
    effect === 'medium' ? 'var(--color-success)' :
    effect === 'small' ? 'var(--color-warning)' :
    'var(--color-text-muted)'
  return (
    <div className="flex items-center justify-between text-xs pl-2 pt-0.5">
      <span style={{ color: 'var(--color-text-muted)' }}>{s.effect}</span>
      <span>
        <span style={{ color: 'var(--color-text-primary)' }}>{deltaStr}</span>
        <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{dStr}</span>
        <span className="mx-1" style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ color: effectColor, fontWeight: 600 }}>{effectLabel}</span>
      </span>
    </div>
  )
}

// Intensitäts-Block: low/mid/high-Buckets für Mood und Body
function IntensityBlock({ title, mood, body, s }: { title: string; mood: Record<string, GroupStats>; body: Record<string, GroupStats>; s: Record<string, string> }) {
  const buckets: ('low' | 'mid' | 'high')[] = ['low', 'mid', 'high']
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
        {title}
      </h4>
      <div className="pl-2 space-y-1" style={{ borderLeft: '2px solid var(--color-border)' }}>
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{s.mood}</div>
        {buckets.map((b) => (
          <Row key={b} name={s['intensity_' + b]} stats={mood[b]} />
        ))}
      </div>
      <div className="mt-2 pl-2 space-y-1" style={{ borderLeft: '2px solid var(--color-border)' }}>
        <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{s.body}</div>
        {buckets.map((b) => (
          <Row key={b} name={s['intensity_' + b]} stats={body[b]} />
        ))}
      </div>
    </div>
  )
}


// Zeigt einen Hinweis wenn die Datenlage für eine stabile Analyse zu dünn ist
function _thinDataHint(data: SportCorrelationData, s: Record<string, string>) {
  const sameDayNSport = data.same_day.mood.group_a.n
  const sameDayNRest = data.same_day.mood.group_b.n
  const hasOverlap = sameDayNSport > 0 && sameDayNRest > 0
  const isStable = sameDayNSport >= 5 && sameDayNRest >= 5
  if (!hasOverlap) {
    return (
      <div className="text-xs mt-2 px-2 py-1 rounded border"
        style={{
          color: 'var(--color-warning)',
          borderColor: 'var(--color-warning)',
          background: 'rgba(255, 191, 0, 0.08)',
        }}>
        {s.hintNoOverlap}
      </div>
    )
  }
  if (!isStable) {
    return (
      <div className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
        {s.hintLowN}
      </div>
    )
  }
  return null
}

export default SportCorrelationCard
