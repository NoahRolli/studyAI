// SportTimeline — Wochen-/Monatsverlauf
// daily-Granularitaet (30d): Linie, viele Punkte
// monthly (12m/all): Balken, wenige Punkte
// Zwei Metriken: Sessions (Balken/Linie) + Minuten (Linie)

import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { TimelinePoint } from '../../types/sport'

interface Props {
  data: TimelinePoint[]
  granularity: 'daily' | 'monthly'
}

// Achsen-Label kuerzen: daily -> "DD.MM", monthly -> "MM/YY"
function formatPeriod(period: string, granularity: 'daily' | 'monthly'): string {
  if (granularity === 'daily') {
    // period = "YYYY-MM-DD"
    const [, m, d] = period.split('-')
    return `${d}.${m}`
  }
  // period = "YYYY-MM"
  const [y, m] = period.split('-')
  return `${m}/${y.slice(2)}`
}

export default function SportTimeline({ data, granularity }: Props) {
  if (data.length === 0) {
    return null
  }

  const chartData = data.map((p) => ({
    label: formatPeriod(p.period, granularity),
    Sessions: p.sessions,
    Minuten: p.minutes,
  }))

  return (
    <div
      className="hud-card p-4 rounded-lg border mb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <h2
        className="text-sm font-semibold mb-4 uppercase tracking-wider"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Verlauf
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            yAxisId="sessions"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="minutes"
            orientation="right"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--color-text-secondary)' }}
          />
          <Bar
            yAxisId="sessions"
            dataKey="Sessions"
            fill="var(--color-primary)"
            fillOpacity={0.7}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="minutes"
            type="monotone"
            dataKey="Minuten"
            stroke="var(--color-text-secondary)"
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
