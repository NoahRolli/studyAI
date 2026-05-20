// SportIntensityHistogram — Intensitaets-Verteilung (1-5) pro Sport-Typ
// Recharts BarChart, X-Achse = Intensitaetsstufe, Balken gruppiert pro Typ
// Eintraege ohne Intensitaet (NULL) sind nicht im Backend-Payload

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { IntensityHistogramPoint } from '../../types/sport'

interface Props {
  data: IntensityHistogramPoint[]
}

// Feste Farbpalette fuer bis zu 6 Typen (HUD-cyan zuerst)
const BAR_COLORS = [
  'var(--color-primary)',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#60a5fa',
]

export default function SportIntensityHistogram({ data }: Props) {
  if (data.length === 0) {
    return null
  }

  // Typen sammeln
  const types = [...new Set(data.map((d) => d.type))]

  // Pivot: pro Intensitaet (1-5) ein Objekt mit Count je Typ
  const chartData = [1, 2, 3, 4, 5].map((intensity) => {
    const row: Record<string, number | string> = { intensity: `Stufe ${intensity}` }
    for (const type of types) {
      const match = data.find(
        (d) => d.type === type && d.intensity === intensity
      )
      row[type] = match ? match.count : 0
    }
    return row
  })

  return (
    <div
      className="hud-card p-4 rounded-lg border mb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <h2
        className="text-sm font-semibold mb-4 uppercase tracking-wider"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Intensitaets-Verteilung
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="intensity"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          />
          <YAxis
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--color-text-secondary)' }}
            cursor={{ fill: 'var(--color-border)', fillOpacity: 0.2 }}
          />
          {types.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11 }} />
          )}
          {types.map((type, i) => (
            <Bar
              key={type}
              dataKey={type}
              fill={BAR_COLORS[i % BAR_COLORS.length]}
              fillOpacity={0.8}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
