// MoodDayView — Detailansicht eines Tages mit allen Check-Ins
// Zeigt Uhrzeiten, ausgewaehlte Moods, Scores, optionale Notizen

import { useState, useEffect } from 'react'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import { getScoreColor, getScoreLabel } from './MoodScaleLegend'

// Mood-Labels (gleich wie im Modal)
const MOOD_LABELS: Record<string, { de: string; en: string }> = {
  energized: { de: 'Energiegeladen', en: 'Energized' },
  calm: { de: 'Ruhig', en: 'Calm' },
  focused: { de: 'Fokussiert', en: 'Focused' },
  happy: { de: 'Glücklich', en: 'Happy' },
  motivated: { de: 'Motiviert', en: 'Motivated' },
  creative: { de: 'Kreativ', en: 'Creative' },
  social: { de: 'Gesellig', en: 'Social' },
  tired: { de: 'Müde', en: 'Tired' },
  stressed: { de: 'Gestresst', en: 'Stressed' },
  anxious: { de: 'Ängstlich', en: 'Anxious' },
  sad: { de: 'Traurig', en: 'Sad' },
  irritated: { de: 'Gereizt', en: 'Irritated' },
  unfocused: { de: 'Unkonzentriert', en: 'Unfocused' },
  lonely: { de: 'Einsam', en: 'Lonely' },
}

const POSITIVE = new Set(['energized','calm','focused','happy','motivated','creative','social'])

interface CheckIn {
  id: number
  timestamp: string
  moods: string[]
  score: number
  note: string | null
}

interface Props {
  date: string
  journalScore: number | null
  onClose: () => void
}

export default function MoodDayView({ date, journalScore, onClose }: Props) {
  const { language } = useLanguage()
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

  const formatTime = (iso: string) => {
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

  return (
    <div className="rounded-lg border p-4 animate-fade-in"
      style={{
        background: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border-glow)',
      }}>
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
          {language === 'de' ? 'Keine Daten fuer diesen Tag' : 'No data for this day'}
        </p>
      ) : (
        <div className="space-y-2">
          {checkins.map(c => (
            <div key={c.id} className="flex items-start gap-3 py-1.5 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-xs font-mono shrink-0 w-12"
                style={{ color: 'var(--color-text-muted)' }}>
                {formatTime(c.timestamp)}
              </span>
              <span className="text-sm font-mono shrink-0 w-8"
                style={{ color: getScoreColor(c.score) }}>
                {c.score}
              </span>
              <div className="flex flex-wrap gap-1 flex-1">
                {c.moods.map(m => (
                  <span key={m} className="text-xs px-1.5 py-0.5 rounded border"
                    style={{
                      borderColor: POSITIVE.has(m) ? 'rgba(0,200,100,0.3)' : 'rgba(255,80,80,0.3)',
                      color: POSITIVE.has(m) ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                    {MOOD_LABELS[m]?.[language] || m}
                  </span>
                ))}
              </div>
              {c.note && (
                <span className="text-xs italic truncate max-w-32"
                  style={{ color: 'var(--color-text-muted)' }}>
                  {c.note}
                </span>
              )}
            </div>
          ))}
          {journalScore !== null && (
            <div className="flex items-center gap-3 py-1.5">
              <span className="text-xs font-mono shrink-0 w-12"
                style={{ color: 'var(--color-text-muted)' }}>
                Journal
              </span>
              <span className="text-sm font-mono shrink-0 w-8"
                style={{ color: getScoreColor(journalScore) }}>
                {journalScore.toFixed(1)}
              </span>
              <span className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}>
                {language === 'de' ? 'Aus Journal-Analyse' : 'From journal analysis'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
