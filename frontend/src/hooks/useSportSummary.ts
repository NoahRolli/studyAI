// useSportSummary — Schlanke Sport-Kennzahlen fuer das Kalender-Header-Widget
// Zieht einmal range=30d und liefert nur Sessions + Stunden
// Kein Range-State (anders als useSportStats) — reines Anzeige-Widget

import { useState, useEffect } from 'react'
import { get } from './useAPI'
import type { SportStats } from '../types/sport'

interface SportSummary {
  sessions: number
  hours: number
}

export default function useSportSummary() {
  const [summary, setSummary] = useState<SportSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    get<SportStats>('/api/sport/stats?range=30d')
      .then((data) => {
        if (cancelled) return
        // Minuten -> Stunden, auf ganze Stunde gerundet
        const hours = Math.round((data.summary.minutes || 0) / 60)
        setSummary({ sessions: data.summary.sessions || 0, hours })
      })
      .catch(() => { if (!cancelled) setSummary(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { summary, loading }
}
