// useJournalAnalytics — Zentraler Cache für Journal-Analysedaten
// Moods, Clusters, Storylines und Insights werden einmal geladen
// und bleiben beim Tab-Wechsel erhalten (kein Neuladen von Ollama)
// Wird von useJournalState eingebunden und an Komponenten weitergereicht

import { useState } from 'react'
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

  // --- Mood-State ---
  const [moods, setMoods] = useState<MoodResult[]>([])
  const [moodsLoaded, setMoodsLoaded] = useState(false)

  // --- Cluster-State ---
  const [clusters, setClusters] = useState<ClusterResult[]>([])
  const [clustersLoaded, setClustersLoaded] = useState(false)
  const [clustersLoading, setClustersLoading] = useState(false)
  const [clustersError, setClustersError] = useState<string | null>(null)

  // --- Storyline-State ---
  const [storylines, setStorylines] = useState<StorylineResult[]>([])
  const [storylinesLoaded, setStorylinesLoaded] = useState(false)
  const [storylinesLoading, setStorylinesLoading] = useState(false)
  const [storylinesError, setStorylinesError] = useState<string | null>(null)

  // --- Insights-State (Key-Value Cache) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [insightResults, setInsightResults] = useState<Record<string, any>>({})
  const [insightLoading, setInsightLoading] = useState<Record<string, boolean>>({})
  const [insightErrors, setInsightErrors] = useState<Record<string, string>>({})

  // --- Moods laden (mit Cache-Flag) ---
  async function loadMoods() {
    if (moodsLoaded) return
    try {
      const data = await post<MoodResult[]>(
        `/api/journal/analytics/mood?language=${language}`
      )
      setMoods(data)
      setMoodsLoaded(true)
    } catch (err) {
      // Fehler wird im aufrufenden Hook behandelt
      throw err
    }
  }

  // --- Clusters laden (mit Cache-Flag) ---
  async function loadClusters() {
    if (clustersLoaded) return
    try {
      setClustersLoading(true)
      setClustersError(null)
      const data = await post<ClusterResult[]>(
        `/api/journal/analytics/clusters?language=${language}`
      )
      setClusters(data)
      setClustersLoaded(true)
    } catch (err) {
      setClustersError(err instanceof Error ? err.message : 'Error')
    } finally {
      setClustersLoading(false)
    }
  }

  // --- Storylines laden (mit Cache-Flag) ---
  async function loadStorylines() {
    if (storylinesLoaded) return
    try {
      setStorylinesLoading(true)
      setStorylinesError(null)
      const data = await post<StorylineResult[]>(
        `/api/journal/analytics/storylines?language=${language}`
      )
      setStorylines(data)
      setStorylinesLoaded(true)
    } catch (err) {
      setStorylinesError(err instanceof Error ? err.message : 'Error')
    } finally {
      setStorylinesLoading(false)
    }
  }

  // --- Insight laden (Toggle: laden oder zuklappen) ---
  async function loadInsight(key: InsightKey) {
    // Toggle: wenn schon geladen, zuklappen
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
    setMoodsLoaded(false)
    setClusters([])
    setClustersLoaded(false)
    setClustersLoading(false)
    setClustersError(null)
    setStorylines([])
    setStorylinesLoaded(false)
    setStorylinesLoading(false)
    setStorylinesError(null)
    setInsightResults({})
    setInsightLoading({})
    setInsightErrors({})
  }

  // --- Cache invalidieren (nach Entry-Änderung) ---
  function invalidateCache() {
    setMoodsLoaded(false)
    setClustersLoaded(false)
    setStorylinesLoaded(false)
    setInsightResults({})
  }

  return {
    // Moods
    moods, moodsLoaded, loadMoods,
    // Clusters
    clusters, clustersLoaded, clustersLoading, clustersError, loadClusters,
    // Storylines
    storylines, storylinesLoaded, storylinesLoading, storylinesError, loadStorylines,
    // Insights
    insightResults, insightLoading, insightErrors, loadInsight,
    // Aktionen
    resetAnalytics, invalidateCache,
  }
}
