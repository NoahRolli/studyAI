// MoodChart — Stimmungsverlauf mit Check-In + Journal Daten
// Zeiträume: Tag, Woche, Monat, Jahr, Gesamt
// Daten kommen vom /api/journal/mood-checkins/aggregated Endpoint
// Journal-Mood-Scores (-1..1) werden auf 1-10 Skala normalisiert

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

type Range = 'day' | 'week' | 'month' | 'year' | 'all'

interface AggPoint {
  date: string
  checkin_scores: number[]
  journal_score: number | null
  combined_score: number
  checkin_count: number
}

interface ChartPoint {
  label: string
  score: number
  checkins: number
  hasJournal: boolean
}

const RANGE_DAYS: Record<Range, number> = {
  day: 1, week: 7, month: 30, year: 365, all: 3650,
}

export default function MoodChart() {
  const { language } = useLanguage()
  const [range, setRange] = useState<Range>('month')
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const days = RANGE_DAYS[range]
      const raw = await get<AggPoint[]>(
        `/api/journal/mood-checkins/aggregated?days=${days}`
      )
      const points: ChartPoint[] = raw.map(p => ({
        label: range === 'day'
          ? p.date
          : p.date.slice(5),
        score: p.combined_score,
        checkins: p.checkin_count,
        hasJournal: p.journal_score !== null,
      }))
      setData(points)
    } catch (err) {
      console.error('Mood-Daten laden fehlgeschlagen:', err)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { loadData() }, [loadData])

  const ranges: { key: Range; de: string; en: string }[] = [
    { key: 'week', de: 'Woche', en: 'Week' },
    { key: 'month', de: 'Monat', en: 'Month' },
    { key: 'year', de: 'Jahr', en: 'Year' },
    { key: 'all', de: 'Gesamt', en: 'All' },
  ]

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="hud-title text-sm"
          style={{ color: 'var(--color-primary)' }}>
          {language === 'de' ? 'STIMMUNGSVERLAUF' : 'MOOD TIMELINE'}
        </h3>
        <div className="flex gap-1">
          {ranges.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className="text-xs px-2 py-0.5 rounded border transition-all"
              style={{
                borderColor: range === r.key ? 'var(--color-primary)' : 'var(--color-border)',
                background: range === r.key ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                color: range === r.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}>
              {language === 'de' ? r.de : r.en}
            </button>
          ))}
        </div>
      </div>

      <div className="hud-card p-4">
        {loading ? (
          <p className="text-sm text-center py-8"
            style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de' ? 'Laden...' : 'Loading...'}
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-center py-8"
            style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine Daten. Erfasse deine Stimmung auf der Startseite.'
              : 'No data. Log your mood on the welcome page.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hover-bg)" />
              <XAxis dataKey="label"
                stroke="var(--color-border)"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]}
                stroke="var(--color-border)"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <ReferenceLine y={5} stroke="var(--color-border)" strokeDasharray="4 4" />
              <Tooltip content={<MoodTooltip language={language} />} />
              <Line type="monotone" dataKey="score"
                stroke="var(--color-primary)" strokeWidth={2}
                dot={<MoodDot />}
                activeDot={{ r: 6, fill: 'var(--color-primary)' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// Dot — zeigt ob Journal-Eintrag vorhanden (ausgefuellter Punkt)
function MoodDot(props: any) {
  const { cx, cy, payload } = props
  if (!cx || !cy) return null
  const fill = payload.hasJournal ? 'var(--color-primary)' : '#0a0e17'
  return (
    <circle cx={cx} cy={cy} r={4}
      fill={fill} stroke="var(--color-primary)" strokeWidth={2} />
  )
}

// Tooltip
function MoodTooltip({ active, payload, language }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as ChartPoint
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg border"
      style={{
        background: 'var(--color-bg-elevated)',
        borderColor: 'var(--color-border-glow)',
      }}>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {p.label}
      </p>
      <p className="text-sm mt-1" style={{ color: 'var(--color-primary)' }}>
        Score: {p.score}
      </p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {p.checkins > 0
          ? `${p.checkins} Check-In${p.checkins > 1 ? 's' : ''}`
          : (language === 'de' ? 'Kein Check-In' : 'No check-in')}
        {p.hasJournal ? ' + Journal' : ''}
      </p>
    </div>
  )
}
