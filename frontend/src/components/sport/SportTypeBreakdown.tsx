// SportTypeBreakdown — Karten pro Sport-Typ
// Sortiert vom Backend nach Sessions absteigend
// Bei nur einem Typ: einzelne Karte breit; bei vielen: Grid

import type { TypeBreakdown } from '../../types/sport'

interface Props {
  data: TypeBreakdown[]
}

export default function SportTypeBreakdown({ data }: Props) {
  if (data.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <h2
        className="text-sm font-semibold mb-3 uppercase tracking-wider"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Pro Sport-Typ
      </h2>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {data.map((item) => (
          <TypeCard key={item.type} item={item} />
        ))}
      </div>
    </div>
  )
}

// --- Sub-Components ---

function TypeCard({ item }: { item: TypeBreakdown }) {
  const hours = (item.minutes / 60).toFixed(1)
  const intensity = item.avg_intensity != null ? item.avg_intensity.toFixed(1) : '—'

  return (
    <div
      className="hud-card p-4 rounded-lg border"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        className="text-base font-semibold mb-3 truncate"
        style={{ color: 'var(--color-primary)' }}
        title={item.type}
      >
        {item.type}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Sessions" value={item.sessions} />
        <Stat label="Stunden" value={hours} />
        <Stat label="Ø Int." value={intensity} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div
        className="text-lg font-bold"
        style={{ color: 'var(--color-text-primary, #fff)' }}
      >
        {value}
      </div>
      <div
        className="text-[10px] uppercase tracking-wider mt-0.5"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
    </div>
  )
}
