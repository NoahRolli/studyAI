// useWeather — Wetterdaten + Mondphasen fuer einen Monat laden
// Cached in pallas.db, Fetch nur wenn weatherEnabled

import { useState, useEffect } from 'react'
import { get } from './useAPI'

export interface WeatherDay {
  date: string
  temp_max: number | null
  temp_min: number | null
  precipitation: number | null
  wind_max: number | null
  weather_code: number | null
  weather_key: string | null
  moon?: {
    phase: number
    name_de: string
    name_en: string
    symbol: string
    illumination: number
  }
}

// WMO Code → kompaktes Symbol (Text, keine Emojis)
const WEATHER_ICONS: Record<string, string> = {
  clear: '○', mostly_clear: '◔', partly_cloudy: '◑',
  overcast: '●', fog: '≋', drizzle: '·',
  rain: '∣', snow: '✻', showers: '∣∣',
  thunderstorm: '⚡', unknown: '?',
}

export function getWeatherIcon(key: string | null): string {
  if (!key) return ''
  return WEATHER_ICONS[key] || '?'
}

export default function useWeather(
  monthStr: string, enabled: boolean,
) {
  const [data, setData] = useState<Record<string, WeatherDay>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) { setData({}); return }

    async function load() {
      setLoading(true)
      try {
        // Monatsbereich berechnen
        const [y, m] = monthStr.split('-').map(Number)
        const lastDay = new Date(y, m, 0).getDate()
        const start = `${monthStr}-01`
        const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`
        const result = await get<WeatherDay[]>(
          `/api/weather/range/${start}/${end}`
        )
        const map: Record<string, WeatherDay> = {}
        for (const w of result) {
          if (w.date) map[w.date] = w
        }
        setData(map)
      } catch (err) {
        console.error('Weather load failed:', err)
      } finally { setLoading(false) }
    }
    load()
  }, [monthStr, enabled])

  return { weatherByDate: data, weatherLoading: loading }
}
