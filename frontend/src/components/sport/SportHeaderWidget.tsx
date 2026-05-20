// SportHeaderWidget — Dezenter Sport-Indikator im Kalender-Header
// Zeigt Sessions + Stunden der letzten 30 Tage, Klick navigiert zu /sport
// Nur sichtbar wenn Sport-Tracking aktiv ist (enabled-Prop vom Kalender)

import { useNavigate } from 'react-router-dom'
import useSportSummary from '../../hooks/useSportSummary'

interface Props {
  enabled: boolean
}

export default function SportHeaderWidget({ enabled }: Props) {
  const navigate = useNavigate()
  const { summary, loading } = useSportSummary()

  // Kein Widget wenn Tracking aus oder noch keine Daten
  if (!enabled) return null
  if (loading || !summary) return null

  return (
    <button
      className="text-xs px-2 py-1 rounded-md border transition-all"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-secondary)',
        background: 'transparent',
      }}
      onClick={() => navigate('/sport')}
      title="Sport-Statistik oeffnen">
      <span style={{ color: '#4ade80' }}>{summary.sessions}</span>
      {' Sessions \u00b7 '}
      <span style={{ color: '#4ade80' }}>{summary.hours}h</span>
    </button>
  )
}
