// useSportStats — Aggregierte Sport-Statistik fuer /sport-Seite und Kalender-Widget
// Eine Roundtrip, konsistenter Snapshot fuer alle Charts
// Range-Wechsel triggert Reload

import { useState, useEffect, useCallback } from 'react'
import { get } from './useAPI'
import type { SportStats, SportRange } from '../types/sport'

export default function useSportStats(initialRange: SportRange = '30d') {
  const [range, setRange] = useState<SportRange>(initialRange)
  const [stats, setStats] = useState<SportStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await get<SportStats>(`/api/sport/stats?range=${range}`)
      setStats(data)
    } catch (e) {
      setStats(null)
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  return { stats, loading, error, range, setRange, reload: load }
}
