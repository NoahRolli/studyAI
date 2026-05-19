// SportPage — Sport-Statistiken auf eigener Seite (nicht in Sidebar)
// Erreichbar via /sport oder Klick auf Kalender-Mini-Widget
// Range-Selector: 30 Tage / 12 Monate / Alle
//
// Skelett-Phase: Range-Selector + Summary-Card + JSON-Dump zur Verifikation
// Charts folgen einzeln in spaeteren Commits

import useSportStats from '../hooks/useSportStats'
import type { SportRange } from '../types/sport'

const RANGE_OPTIONS: { value: SportRange; label: string }[] = [
  { value: '30d', label: '30 Tage' },
  { value: '12m', label: '12 Monate' },
  { value: 'all', label: 'Alle' },
]

export default function SportPage() {
  const { stats, loading, error, range, setRange } = useSportStats('30d')

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          Sport
        </h1>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Statistiken & Auswertung
        </span>
      </div>

      {/* Range-Selector: Pillen */}
      <div className="flex gap-2 mb-6">
        {RANGE_OPTIONS.map((opt) => {
          const active = range === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className="px-4 py-1.5 text-xs rounded-full border transition-colors"
              style={{
                borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                backgroundColor: active ? 'var(--color-active-bg)' : 'transparent',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Status */}
      {loading && (
        <div className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Lade Statistiken…
        </div>
      )}
      {error && (
        <div
          className="hud-card p-4 rounded-lg border mb-4"
          style={{ borderColor: 'var(--color-error, #ff4444)' }}
        >
          <span className="text-xs" style={{ color: 'var(--color-error, #ff4444)' }}>
            Fehler beim Laden: {error}
          </span>
        </div>
      )}

      {/* Summary-Card */}
      {stats && (
        <div
          className="hud-card p-6 rounded-lg border mb-6"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="grid grid-cols-3 gap-6">
            <SummaryStat
              label="Sessions"
              value={stats.summary.total_sessions}
            />
            <SummaryStat
              label="Stunden"
              value={(stats.summary.total_minutes / 60).toFixed(1)}
            />
            <SummaryStat
              label="Aktive Tage"
              value={stats.summary.active_days}
            />
          </div>
        </div>
      )}

      {/* Platzhalter fuer Charts */}
      {stats && (
        <div
          className="hud-card p-6 rounded-lg border mb-6"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Debug — Rohdaten (wird in naechsten Commits durch Charts ersetzt)
          </h2>
          <pre
            className="text-xs overflow-auto max-h-96"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {JSON.stringify(
              {
                range: stats.range,
                granularity: stats.granularity,
                by_type: stats.by_type,
                timeline_points: stats.timeline.length,
                weekday_heatmap_entries: stats.weekday_heatmap.length,
                intensity_histogram_entries: stats.intensity_histogram.length,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Empty-State */}
      {stats && stats.summary.total_sessions === 0 && (
        <div
          className="hud-card p-6 rounded-lg border text-center"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Keine Sport-Eintraege in diesem Zeitraum.
          </p>
        </div>
      )}
    </div>
  )
}

// --- Sub-Components ---

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <div
        className="text-3xl font-bold mb-1"
        style={{ color: 'var(--color-primary)' }}
      >
        {value}
      </div>
      <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </div>
    </div>
  )
}
