// useSportTypes — Liste aller bisher genutzten Sport-Typen
// Fuer Autocomplete im Sport-Eingabeformular
// Sortiert nach Haeufigkeit (haeufigster zuerst)

import { useState, useEffect, useCallback } from 'react'
import { get } from './useAPI'
import type { SportTypeInfo } from '../types/sport'

export default function useSportTypes() {
  const [types, setTypes] = useState<SportTypeInfo[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<SportTypeInfo[]>('/api/sport/types')
      setTypes(data)
    } catch {
      setTypes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { types, loading, reload: load }
}
