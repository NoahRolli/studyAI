// useGitCommits — GitHub Commit-Daten für den Kalender
// Toggle-State in localStorage ('pallas-git-enabled')
// Holt Tages-Statistiken pro Monat via /api/git/commits

import { useState, useEffect, useCallback } from 'react'
import { get, post } from './useAPI'

const STORAGE_KEY = 'pallas-git-enabled'

export interface GitDay {
  date: string
  count: number
  repos: string[]
  first_commit: string
  last_commit: string
  work_hours: number
  commits: { sha: string; repo: string; message: string; time: string }[]
}

export function useGitCommits(month: number, year: number) {
  const [enabled, setEnabledState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false' }
    catch { return true }
  })
  const [days, setDays] = useState<GitDay[]>([])
  const [loading, setLoading] = useState(false)

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)
    localStorage.setItem(STORAGE_KEY, String(v))
  }, [])

  // Commits für den Monat laden
  useEffect(() => {
    if (!enabled) { setDays([]); return }
    setLoading(true)
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    get<{ month: string; days: GitDay[] }>(`/api/git/commits?month=${monthStr}`)
      .then(data => setDays(data.days || []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false))
  }, [month, year, enabled])

  // Git-Daten für ein bestimmtes Datum
  const forDate = useCallback((dateStr: string): GitDay | null => {
    return days.find(d => d.date === dateStr) || null
  }, [days])

  // Manueller Sync
  const sync = useCallback(async () => {
    await post('/api/git/sync', {})
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const data = await get<{ month: string; days: GitDay[] }>(`/api/git/commits?month=${monthStr}`)
    setDays(data.days || [])
  }, [month, year])

  return { enabled, setEnabled, days, loading, forDate, sync }
}
