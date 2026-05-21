// Sport-Typen fuer Stats-API
// Korrespondiert zu backend/api/sport_stats.py

export type SportRange = '30d' | '12m' | 'all'

// Feste Liste der Muskelgruppen — geschlossenes Vokabular.
// Werte sind stabile englische Schluessel; die Anzeige laeuft ueber i18n
// (t.sport.muscleGroups[key]). Quelle der Wahrheit fuer SportModal-Chips
// und spaetere Pattern-Auswertung.
export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'legs', 'core', 'fullbody',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface SportTypeInfo {
  type: string
  count: number
  last_used: string | null  // ISO-Datum
}

export interface StatsSummary {
  total_sessions: number
  total_minutes: number
  active_days: number
}

export interface TypeBreakdown {
  type: string
  sessions: number
  minutes: number
  avg_intensity: number | null
}

export interface TimelinePoint {
  period: string  // ISO-Datum bei daily, YYYY-MM bei monthly
  sessions: number
  minutes: number
}

export interface WeekdayHeatmapPoint {
  weekday: number  // 0=Mo ... 6=So
  type: string
  count: number
}

export interface IntensityHistogramPoint {
  type: string
  intensity: number  // 1-5
  count: number
}

export interface SportStats {
  range: SportRange
  granularity: 'daily' | 'monthly'
  summary: StatsSummary
  by_type: TypeBreakdown[]
  timeline: TimelinePoint[]
  weekday_heatmap: WeekdayHeatmapPoint[]
  intensity_histogram: IntensityHistogramPoint[]
}
