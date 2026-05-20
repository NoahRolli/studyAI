// SportHeatmap — Wochentag x Sport-Typ Grid
// Zellintensitaet = relative Haeufigkeit (0..max)
// Pures CSS-Grid, kein Recharts

import type { WeekdayHeatmapPoint } from '../../types/sport'

interface Props {
  data: WeekdayHeatmapPoint[]
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function SportHeatmap({ data }: Props) {
  if (data.length === 0) {
    return null
  }

  // Alle Typen sammeln (Reihenfolge: nach Gesamthaeufigkeit absteigend)
  const typeTotals = new Map<string, number>()
  for (const d of data) {
    typeTotals.set(d.type, (typeTotals.get(d.type) ?? 0) + d.count)
  }
  const types = [...typeTotals.keys()].sort(
    (a, b) => (typeTotals.get(b) ?? 0) - (typeTotals.get(a) ?? 0)
  )

  // Lookup (type, weekday) -> count
  const lookup = new Map<string, number>()
  let maxCount = 0
  for (const d of data) {
    lookup.set(`${d.type}|${d.weekday}`, d.count)
    if (d.count > maxCount) maxCount = d.count
  }

  return (
    <div
      className="hud-card p-4 rounded-lg border mb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <h2
        className="text-sm font-semibold mb-4 uppercase tracking-wider"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Wochentag-Verteilung
      </h2>

      {/* Kopfzeile: Wochentage */}
      <div
        className="grid gap-1 mb-1"
        style={{ gridTemplateColumns: '90px repeat(7, 1fr)' }}
      >
        <div />
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="text-[10px] text-center uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Eine Zeile pro Typ */}
      {types.map((type) => (
        <div
          key={type}
          className="grid gap-1 mb-1 items-center"
          style={{ gridTemplateColumns: '90px repeat(7, 1fr)' }}
        >
          <div
            className="text-xs truncate pr-2"
            style={{ color: 'var(--color-text-secondary)' }}
            title={type}
          >
            {type}
          </div>
          {WEEKDAYS.map((_, wd) => {
            const count = lookup.get(`${type}|${wd}`) ?? 0
            const ratio = maxCount > 0 ? count / maxCount : 0
            return (
              <div
                key={wd}
                className="h-8 rounded flex items-center justify-center text-[10px]"
                style={{
                  background:
                    count === 0
                      ? 'var(--color-bg-surface)'
                      : `color-mix(in srgb, var(--color-primary) ${15 + ratio * 85}%, transparent)`,
                  border: '1px solid var(--color-border)',
                  color: ratio > 0.5 ? '#000' : 'var(--color-text-muted)',
                }}
                title={`${type}, ${WEEKDAYS[wd]}: ${count}`}
              >
                {count > 0 ? count : ''}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
