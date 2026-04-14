// DetectProgressPanel — Expandierbares Live-Log für Detect Relations
// Zeigt Timer, Fortschrittsbalken, Provider-Badge pro Runde
// Kollabiert: Einzeiler mit Timer + Fortschritt
// Expandiert: Vollständiges Log aller Runden

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'

interface RoundLog {
  round: number
  total: number
  status: 'running' | 'done' | 'error'
  created?: number
  totalCreated?: number
  provider?: string
  roundTime?: number
  error?: string
}

interface Props {
  rounds: RoundLog[]
  elapsed: number
  active: boolean
  totalCreated: number
}

export default function DetectProgressPanel({
  rounds, elapsed, active, totalCreated,
}: Props) {
  const { language } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  const currentRound = rounds.length > 0
    ? rounds[rounds.length - 1].round : 0
  const totalRounds = rounds.length > 0
    ? rounds[rounds.length - 1].total : 10
  const progress = totalRounds > 0
    ? Math.round((currentRound / totalRounds) * 100) : 0

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`
  }

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{
        background: 'rgba(0, 212, 255, 0.03)',
        borderColor: 'rgba(0, 212, 255, 0.2)',
      }}>
      {/* Kollabierte Ansicht — klickbar */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs"
        style={{ color: 'var(--color-primary)' }}>
        <span className="flex items-center gap-2">
          {active && (
            <span className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--color-primary)' }} />
          )}
          <span>
            {active
              ? (language === 'de'
                ? `Runde ${currentRound}/${totalRounds}`
                : `Round ${currentRound}/${totalRounds}`)
              : (language === 'de' ? 'Erkennung abgeschlossen' : 'Detection complete')}
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {formatTime(elapsed)}
          </span>
          <span style={{ color: 'var(--color-success)' }}>
            +{totalCreated}
          </span>
        </span>
        <span style={{ color: 'var(--color-text-muted)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Fortschrittsbalken */}
      <div className="h-1 mx-3 mb-1 rounded-full overflow-hidden"
        style={{ background: 'rgba(0, 212, 255, 0.1)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: active
              ? 'var(--color-primary)'
              : 'var(--color-success)',
          }} />
      </div>

      {/* Expandiertes Log */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1 max-h-48 overflow-y-auto">
          {rounds.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--color-text-secondary)' }}>
              <span className="w-16 shrink-0"
                style={{ color: 'var(--color-text-muted)' }}>
                R{r.round}/{r.total}
              </span>
              {r.status === 'done' && (
                <>
                  <span style={{ color: 'var(--color-success)' }}>
                    +{r.created}
                  </span>
                  {r.provider && (
                    <span className="px-1.5 py-0.5 rounded text-xs"
                      style={{
                        background: 'rgba(0, 212, 255, 0.1)',
                        color: 'var(--color-primary)',
                        fontSize: '0.65rem',
                      }}>
                      {r.provider}
                    </span>
                  )}
                  {r.roundTime && (
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {r.roundTime}s
                    </span>
                  )}
                </>
              )}
              {r.status === 'error' && (
                <span style={{ color: 'var(--color-danger)' }}>
                  {r.error?.slice(0, 60) || 'Fehler'}
                </span>
              )}
              {r.status === 'running' && (
                <span className="animate-pulse"
                  style={{ color: 'var(--color-primary)' }}>
                  {language === 'de' ? 'läuft...' : 'running...'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
