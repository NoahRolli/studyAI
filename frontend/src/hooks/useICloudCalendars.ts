// useICloudCalendars — laedt iCloud-Calendar-Metadaten beim Mount
// Verwendet fuer Badge-Anzeige im Calendar-UI:
//   "iCloud · Privat" statt nur "iCloud"
//
// Daten kommen vom Backend (auth-protected), Cache pro Session.

import { useEffect, useState } from 'react'

export interface ICloudCalendar {
  id: number
  name: string
  url: string
  color: string | null
  sync_enabled: boolean
  event_count: number
  last_sync: string | null
  last_error: string | null
}

let _cache: ICloudCalendar[] | null = null
let _loading = false
const _listeners: ((cals: ICloudCalendar[]) => void)[] = []

async function _fetchOnce(): Promise<ICloudCalendar[]> {
  if (_cache !== null) return _cache
  if (_loading) {
    return new Promise((resolve) => {
      _listeners.push(resolve)
    })
  }
  _loading = true
  try {
    const res = await fetch('/api/icloud/calendars', { credentials: 'include' })
    if (!res.ok) {
      // Auth-Fail oder Server-Fehler: leeres Array, kein Crash im UI
      _cache = []
    } else {
      _cache = await res.json()
    }
  } catch {
    _cache = []
  } finally {
    _loading = false
    _listeners.forEach((cb) => cb(_cache!))
    _listeners.length = 0
  }
  return _cache!
}

export function useICloudCalendars() {
  const [calendars, setCalendars] = useState<ICloudCalendar[]>(_cache || [])

  useEffect(() => {
    let cancelled = false
    _fetchOnce().then((cals) => {
      if (!cancelled) setCalendars(cals)
    })
    return () => { cancelled = true }
  }, [])

  // Helper: ID → Name
  const nameById = (id: number | null | undefined): string => {
    if (id == null) return 'iCloud'
    const cal = calendars.find((c) => c.id === id)
    return cal ? cal.name : 'iCloud'
  }

  return { calendars, nameById }
}
