// MoodDayView — Tagesdetail mit Mini-Zeitgraph + Check-In Liste
// Zeigt Uhrzeiten, Moods, Body-Moods, Scores, Notizen

import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import { getScoreColor, getScoreLabel } from './MoodScaleLegend'

const POSITIVE = new Set([
  'energized', 'refreshed', 'calm', 'grounded', 'focused', 'clear',
  'curious', 'happy', 'grateful', 'proud', 'motivated', 'creative',
  'social', 'connected',
])
const BODY_POSITIVE = new Set(['well_slept', 'energetic', 'lightness'])

interface CheckIn {
  id: number
  timestamp: string
  moods: string[]
  score: number
  body_moods: string[]
  body_score: number | null
  note: string | null
}

interface Props {
  date: string
  journalScore: number | null
  onClose: () => void
}

export default function MoodDayView({ date, journalScore, onClose }: Props) {
  const { t, language } = useLanguage()
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const data = await get<CheckIn[]>(`/api/journal/mood-checkins/by-date/${date}`)
        setCheckins(data)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    })()
  }, [date])

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString(language === 'de' ? 'de-CH' : 'en-US', {
      hour: '2-digit', minute: '2-digit',
    })
  }

  // Tages-Durchschnitt
  const allScores = checkins.map(c => c.score)
  if (journalScore !== null) allScores.push(journalScore)
  const dayAvg = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) : null

  // Daten fuer Mini-Zeitgraph
  const chartData = checkins.map(c => ({
    time: fmtTime(c.timestamp),
    score: c.score,
  }))

  // Label-Lookup via i18n
  const moodLabel = (key: string) =>
    (t.moodCheckIn.moods as Record<string, string>)[key] || key
  const bodyLabel = (key: string) =>
    (t.moodCheckIn.bodyMoods as Record<string, string>)[key] || key

  return (
    <div className="rounded-lg border p-4 animate-fade-in"
      style={{
        background: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border-glow)',
      }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="hud-title text-sm" style={{ color: 'var(--color-primary)' }}>
          {date}
        </h4>
        <div className="flex items-center gap-3">
          {dayAvg !== null && (
            <span className="text-sm font-mono"
              style={{ color: getScoreColor(dayAvg) }}>
              {dayAvg.toFixed(1)} — {getScoreLabel(dayAvg, language)}
            </span>
          )}
          <button onClick={onClose} className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de' ? 'Schliessen' : 'Close'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Laden...' : 'Loading...'}
        </p>
      ) : checkins.length === 0 && journalScore === null ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Keine Daten' : 'No data'}
        </p>
      ) : (
        <>
          {/* Mini-Tagesgraph — nur bei 2+ Check-Ins sinnvoll */}
          {chartData.length >= 2 && (
            <div className="mb-4">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="time" stroke="var(--color-border)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                  <YAxis domain={[1, 10]} ticks={[1, 5, 10]} width={25}
                    stroke="var(--color-border)"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                  <ReferenceLine y={5} stroke="var(--color-border)" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-glow)',
                      borderRadius: '6px', fontSize: '12px',
                    }}
                    formatter={(v: number) => [v.toFixed(1), 'Score']} />
                  <Line type="monotone" dataKey="score"
                    stroke="var(--color-primary)" strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--color-primary)', stroke: 'var(--color-primary)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Check-In Liste */}
          <div className="space-y-2">
            {checkins.map(c => (
              <CheckInRow key={c.id} c={c} fmtTime={fmtTime}
                moodLabel={moodLabel} bodyLabel={bodyLabel} />
            ))}
            {journalScore !== null && (
              <div className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-mono shrink-0 w-12"
                  style={{ color: 'var(--color-text-muted)' }}>Journal</span>
                <span className="text-sm font-mono shrink-0 w-8"
                  style={{ color: getScoreColor(journalScore) }}>
                  {journalScore.toFixed(1)}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {language === 'de' ? 'Aus Journal-Analyse' : 'From journal analysis'}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Einzelner Check-In — ausgelagert fuer Uebersicht
function CheckInRow({ c, fmtTime, moodLabel, bodyLabel }: {
  c: { id: number; timestamp: string; moods: string[]; score: number;
    body_moods: string[]; body_score: number | null; note: string | null }
  fmtTime: (iso: string) => string
  moodLabel: (k: string) => string
  bodyLabel: (k: string) => string
}) {
  return (
    <div className="py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono shrink-0 w-12"
          style={{ color: 'var(--color-text-muted)' }}>{fmtTime(c.timestamp)}</span>
        <span className="text-sm font-mono shrink-0 w-8"
          style={{ color: getScoreColor(c.score) }}>{c.score}</span>
        <div className="flex flex-wrap gap-1 flex-1">
          {c.moods.map(m => (
            <span key={m} className="text-xs px-1.5 py-0.5 rounded border"
              style={{
                borderColor: POSITIVE.has(m) ? 'rgba(0,200,100,0.3)' : 'rgba(255,80,80,0.3)',
                color: POSITIVE.has(m) ? 'var(--color-success)' : 'var(--color-danger)',
              }}>{moodLabel(m)}</span>
          ))}
        </div>
        {c.note && (
          <span className="text-xs italic truncate max-w-32"
            style={{ color: 'var(--color-text-muted)' }}>{c.note}</span>
        )}
      </div>
      {/* Body-Moods (falls vorhanden) */}
      {c.body_moods.length > 0 && (
        <div className="flex items-center gap-2 mt-1 ml-[5rem]">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
            BODY
          </span>
          {c.body_score !== null && (
            <span className="text-xs font-mono"
              style={{ color: getScoreColor(c.body_score) }}>{c.body_score}</span>
          )}
          <div className="flex flex-wrap gap-1">
            {c.body_moods.map(m => (
              <span key={m} className="text-xs px-1.5 py-0.5 rounded border"
                style={{
                  borderColor: BODY_POSITIVE.has(m) ? 'rgba(0,200,100,0.3)' : 'rgba(200,150,50,0.3)',
                  color: BODY_POSITIVE.has(m) ? 'var(--color-success)' : 'var(--color-warning, #c89632)',
                }}>{bodyLabel(m)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
