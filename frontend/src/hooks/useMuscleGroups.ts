// useMuscleGroups — Muskelgruppen mit Trainings-Haeufigkeit
// Fuer die Chip-Sortierung im SportModal (haeufigste zuerst)
// Die feste Liste lebt in types/sport.ts (MUSCLE_GROUPS) — dieser Hook
// liefert nur die Haeufigkeiten zur Sortierung.

import { useState, useEffect, useCallback } from 'react'
import { get } from './useAPI'

export interface MuscleGroupInfo {
  group: string
  count: number
}

export default function useMuscleGroups() {
  const [groups, setGroups] = useState<MuscleGroupInfo[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<MuscleGroupInfo[]>('/api/sport/muscle-groups')
      setGroups(data)
    } catch {
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { groups, loading, reload: load }
}
