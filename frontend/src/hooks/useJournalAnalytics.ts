// useJournalAnalytics — Zentraler Cache für Journal-Analysedaten
// Moods, Clusters, Storylines und Insights werden einmal geladen
// und bleiben beim Tab-Wechsel erhalten (kein Neuladen von Ollama)
// Loaded-Flags als useRef um Closure-Probleme zu vermeiden
// Wird von useJournalState eingebunden und an Komponenten weitergereicht

import { useState, useRef } from 'react'
import { post } from './useAPI'
import { useLanguage } from './useLanguage'
import type {
  MoodResult,
  ClusterResult,
  StorylineResult,
} from '../types/models'

// Insight-Key Typen für die modularen Analysen
export type InsightKey =
  | 'medication-mood'
  | 'weekday-mood'
  | 'writing-patterns'
  | 'keyword-mood'
  | 'ai-summary'

export default function useJournalAnalytics() {
  const { language } = useLanguage()

  // --- Loaded-Flags als Refs (immer aktuell, keine Closure-Probleme) ---
  const moodsLoadedRef = useRef(false)
  const clustersLoadedRef = useRef(false)
  const storylinesLoadedRef = useRef(false)

  // --- Mood-State ---
  const [moods, setMoods] = useState<MoodResult[]>([])

  // --- Cluster-State ---
  const [clusters, setClusters] = useState<ClusterResult[]>([])
  const [clustersLoading, setClustersLoading] = useState(false)
  const [clustersError, setClustersError] = useState<string | null>(null)

  // --- Storyline-State ---
  const [storylines, setStorylines] = useState<StorylineResult[]>([])
  const [storylinesLoading, setStorylinesLoading] = useState(false)
  const [storylinesError, setStorylinesError] = useState<string | null>(null)

  // --- Insights-State (Key-Value Cache) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [insightResults, setInsightResults] = useState<Record<string, any>>({})
  const [insightLoading, setInsightLoading] = useState<Record<string, boolean>>({})
  const [insightErrors, setInsightErrors] = useState<Record<string, string>>({})

  // --- Moods laden (Ref-basierter Cache-Check) ---
  async function loadMoods() {
    if (moodsLoadedRef.current) return
    try {
      const data = await post<MoodResult[]>(
        `/api/journal/analytics/mood?language=${language}`
      )
      setMoods(data)
      moodsLoadedRef.current = true
    } catch (err) {
      throw err
    }
  }

  // --- Clusters laden (Ref-basierter Cache-Check) ---
  async function loadClusters() {
    if (clustersLoadedRef.current) return
    try {
      setClustersLoading(true)
      setClustersError(null)
      const data = await post<ClusterResult[]>(
        `/api/journal/analytics/clusters?language=${language}`
      )
      setClusters(data)
      clustersLoadedRef.current = true
    } catch (err) {
      setClustersError(err instanceof Error ? err.message : 'Error')
    } finally {
      setClustersLoading(false)
    }
  }

  // --- Storylines laden (Ref-basierter Cache-Check) ---
  async function loadStorylines() {
    if (storylinesLoadedRef.current) return
    try {
      setStorylinesLoading(true)
      setStorylinesError(null)
      const data = await post<StorylineResult[]>(
        `/api/journal/analytics/storylines?language=${language}`
      )
      setStorylines(data)
      storylinesLoadedRef.current = true
    } catch (err) {
      setStorylinesError(err instanceof Error ? err.message : 'Error')
    } finally {
      setStorylinesLoading(false)
    }
  }

  // --- Insight laden (Toggle: laden oder zuklappen) ---
  async function loadInsight(key: InsightKey) {
    if (insightResults[key] !== undefined) {
      setInsightResults((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      return
    }

    try {
      setInsightLoading((prev) => ({ ...prev, [key]: true }))
      setInsightErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      const data = await post(
        `/api/journal/insights/${key}?language=${language}`
      )
      setInsightResults((prev) => ({ ...prev, [key]: data }))
    } catch (err) {
      setInsightErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Error',
      }))
    } finally {
      setInsightLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  // --- Alles zurücksetzen (bei Lock/Logout) ---
  function resetAnalytics() {
    setMoods([])
    moodsLoadedRef.current = false
    setClusters([])
    clustersLoadedRef.current = false
    setClustersLoading(false)
    setClustersError(null)
    setStorylines([])
    storylinesLoadedRef.current = false
    setStorylinesLoading(false)
    setStorylinesError(null)
    setInsightResults({})
    setInsightLoading({})
    setInsightErrors({})
  }

  // --- Cache invalidieren (nach Entry-Änderung) ---
  function invalidateCache() {
    moodsLoadedRef.current = false
    clustersLoadedRef.current = false
    storylinesLoadedRef.current = false
    setInsightResults({})
  }

  return {
    // Moods
    moods, moodsLoaded: moodsLoadedRef.current, loadMoods,
    // Clusters
    clusters, clustersLoading, clustersError, loadClusters,
    // Storylines
    storylines, storylinesLoading, storylinesError, loadStorylines,
    // Insights
    insightResults, insightLoading, insightErrors, loadInsight,
    // Aktionen
    resetAnalytics, invalidateCache,
  }
}
