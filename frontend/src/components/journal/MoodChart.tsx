// MoodChart — Stimmungsverlauf als Linien-Chart
// Zeigt Mood-Scores (-1.0 bis 1.0) über Zeit an
// Nutzt recharts für die Visualisierung
//
// Props: entries (für Datum-Zuordnung)
// Ruft POST /api/journal/analytics/mood auf um Daten zu laden

import { useState, useEffect } from 'react'
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
import { post } from '../../hooks/useAPI'
import type { MoodResult, JournalEntry } from '../../types/models'

// Props — braucht die Einträge für Datum-Zuordnung
interface MoodChartProps {
  entries: JournalEntry[]
}

// Datenformat für recharts (Datum + Score + Label)
interface ChartPoint {
  date: string
  score: number
  label: string
  title: string
}

function MoodChart({ entries }: MoodChartProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mood-Daten laden wenn Einträge vorhanden
  useEffect(() => {
    if (entries.length > 0) loadMoods()
  }, [entries])

  async function loadMoods() {
    try {
      setLoading(true)
      setError(null)

      // POST /api/journal/analytics/mood → alle Einträge analysieren
      const moods = await post<MoodResult[]>('/api/journal/analytics/mood')

      // Mood-Daten mit Datum aus den Einträgen zusammenführen
      const entryMap = new Map(entries.map((e) => [e.id, e]))

      const points: ChartPoint[] = moods
        .filter((m) => !m.error)
        .map((m) => {
          const entry = entryMap.get(m.entry_id)
          return {
            date: entry?.date ?? 'unbekannt',
            score: m.score,
            label: m.label,
            title: entry?.title ?? '',
          }
        })
        // Chronologisch sortieren
        .sort((a, b) => a.date.localeCompare(b.date))

      setData(points)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mood-Analyse fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  // --- Render ---

  if (loading) {
    return <p className="text-gray-400 text-sm">Stimmung wird analysiert...</p>
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Noch keine Mood-Daten. Erstelle Einträge um deinen Stimmungsverlauf zu sehen.
      </p>
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Stimmungsverlauf</h3>

      {/* Chart — responsive Breite, feste Höhe */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          {/* Hintergrund-Raster */}
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />

          {/* X-Achse: Datum */}
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
          />

          {/* Y-Achse: Score von -1 bis 1 */}
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            stroke="#6b7280"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
          />

          {/* Nulllinie hervorheben */}
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 4" />

          {/* Tooltip beim Hovern über Datenpunkte */}
          <Tooltip content={<MoodTooltip />} />

          {/* Die Mood-Linie */}
          <Line
            type="monotone"
            dataKey="score"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={{ r: 4, fill: '#60a5fa' }}
            activeDot={{ r: 6, fill: '#93c5fd' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Custom Tooltip — zeigt Titel, Label und Score beim Hovern
function MoodTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null

  const point = payload[0].payload as ChartPoint

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-white">{point.title}</p>
      <p className="text-xs text-gray-400">{point.date}</p>
      <p className="text-sm mt-1">
        <span className="text-blue-400">{point.label}</span>
        <span className="text-gray-500 ml-2">({point.score.toFixed(1)})</span>
      </p>
    </div>
  )
}

export default MoodChart