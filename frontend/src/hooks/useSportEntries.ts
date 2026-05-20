// useSportEntries — Sport-Einträge laden, erstellen, bearbeiten, löschen
// Toggle-State in localStorage ('pallas-sport-enabled')
// Wird von CalendarPage genutzt

import { useState, useEffect, useCallback } from 'react'
import { get, post, put, del } from './useAPI'

export interface SportEntry {
  id: number
  date: string
  sport_type: string
  duration_min: number | null
  intensity: number | null
  muscle_groups: string[] | null
  note: string | null
}

const STORAGE_KEY = 'pallas-sport-enabled'

export default function useSportEntries(month: number, year: number) {
  const [entries, setEntries] = useState<SportEntry[]>([])
  const [enabled, setEnabledState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  // Toggle speichern
  const setEnabled = useCallback((val: boolean) => {
    setEnabledState(val)
    localStorage.setItem(STORAGE_KEY, String(val))
  }, [])

  // Einträge laden wenn aktiv
  const loadEntries = useCallback(async () => {
    if (!enabled) { setEntries([]); return }
    try {
      const data = await get<SportEntry[]>(
        `/api/sport?month=${month}&year=${year}`
      )
      setEntries(data)
    } catch { setEntries([]) }
  }, [enabled, month, year])

  useEffect(() => { loadEntries() }, [loadEntries])

  // CRUD
  const createEntry = useCallback(async (data: {
    date: string; sport_type: string;
    duration_min: number | null; intensity: number | null;
    muscle_groups: string[] | null; note: string;
  }) => {
    await post('/api/sport', data)
    await loadEntries()
  }, [loadEntries])

  const updateEntry = useCallback(async (id: number, data: {
    sport_type?: string; duration_min?: number | null;
    intensity?: number | null; muscle_groups?: string[] | null;
    note?: string;
  }) => {
    await put(`/api/sport/${id}`, data)
    await loadEntries()
  }, [loadEntries])

  const deleteEntry = useCallback(async (id: number) => {
    await del(`/api/sport/${id}`)
    await loadEntries()
  }, [loadEntries])

  // Hilfsfunktion: Einträge für ein Datum
  const forDate = useCallback((dateStr: string) => {
    return entries.filter((e) => e.date === dateStr)
  }, [entries])

  return {
    entries, enabled, setEnabled,
    createEntry, updateEntry, deleteEntry, forDate,
  }
}
