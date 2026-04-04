// MoodChart — Stimmungsverlauf als Linien-Chart
// Zeigt Mood-Scores (-1.0 bis 1.0) über Zeit an
// Daten kommen als Props vom Parent (Journal.tsx)
// Verwendet recharts mit HUD-Farbpalette

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { useLanguage } from '../../hooks/useLanguage'
import type { MoodResult, JournalEntry } from '../../types/models'

// Props — Daten kommen vom Parent
interface MoodChartProps {
  entries: JournalEntry[]
  moods: MoodResult[]
  loading: boolean
}

// Datenformat für recharts
interface ChartPoint {
  date: string
  score: number
  label: string
  title: string
}

function MoodChart({ entries, moods, loading }: MoodChartProps) {
  const { t } = useLanguage()

  // --- Daten aufbereiten ---
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  const data: ChartPoint[] = moods
    .filter((m) => !m.error)
    .map((m) => {
      const entry = entryMap.get(m.entry_id)
      return {
        date: entry?.date ?? t.moodChart.unknown,
        score: m.score,
        label: m.label,
        title: entry?.title ?? '',
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // --- Render ---
  if (loading) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.moodChart.loading}
      </p>
    )
  }

  if (data.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)' }} className="text-sm">
        {t.moodChart.empty}
      </p>
    )
  }

  return (
    <div className="animate-fade-in">
      <h3
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {t.moodChart.title}
      </h3>

      {/* Chart-Container mit HUD-Border */}
      <div className="hud-card p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hover-bg)" />
            <XAxis
              dataKey="date"
              stroke="var(--color-border)"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            />
            <YAxis
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              stroke="var(--color-border)"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="4 4" />
            <Tooltip content={<MoodTooltip />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 4, fill: '#0a0e17', stroke: 'var(--color-primary)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--color-primary)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Custom Tooltip — zeigt Titel, Label und Score beim Hovern
function MoodTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as ChartPoint
  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg border"
      style={{
        background: 'var(--color-bg-elevated)',
        borderColor: 'var(--color-border-glow)',
        boxShadow: 'var(--color-primary-glow)',
      }}
    >
      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {point.title}
      </p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {point.date}
      </p>
      <p className="text-sm mt-1">
        <span style={{ color: 'var(--color-primary)' }}>{point.label}</span>
        <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>
          ({point.score.toFixed(1)})
        </span>
      </p>
    </div>
  )
}

export default MoodChart