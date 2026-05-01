// useJournalAnalytics — Zentraler Cache für Journal-Analysedaten
// Moods, Clusters, Storylines und Insights werden einmal geladen
// und bleiben beim Tab-Wechsel erhalten (kein Neuladen von Ollama)
// Loaded-Flags als useRef um Closure-Probleme zu vermeiden
// Wird von useJournalState eingebunden und an Komponenten weitergereicht

import { useState, useRef } from 'react'
import { get, post } from './useAPI'
import { useLanguage } from './useLanguage'
import type {
  MoodResult,
  StorylineResult,
  TopicsOverview,
} from '../types/models'

// Insight-Key Typen für die modularen Analysen
export type InsightKey =
  | 'medication-mood'
  | 'weekday-mood'
  | 'writing-patterns'
  | 'keyword-mood'
  | 'ai-summary'
  | 'sport-correlation'

export default function useJournalAnalytics() {
  const { language } = useLanguage()

  // --- Loaded-Flags als Refs (immer aktuell, keine Closure-Probleme) ---
  const moodsLoadedRef = useRef(false)
  const storylinesLoadedRef = useRef(false)
  const topicsLoadedRef = useRef(false)

  // --- Mood-State ---
  const [moods, setMoods] = useState<MoodResult[]>([])

  // --- Topics-State (neue Pipeline: bge-m3 Embeddings + average-link) ---
  const [topicsOverview, setTopicsOverview] = useState<TopicsOverview | null>(null)
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [topicsError, setTopicsError] = useState<string | null>(null)
  const [topicsRecomputing, setTopicsRecomputing] = useState(false)

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

  // --- Topics laden (Ref-basierter Cache-Check) ---
  async function loadTopics() {
    if (topicsLoadedRef.current) return
    try {
      setTopicsLoading(true)
      setTopicsError(null)
      const data = await get<TopicsOverview>('/api/journal/insights/topics')
      setTopicsOverview(data)
      topicsLoadedRef.current = true
    } catch (err) {
      setTopicsError(err instanceof Error ? err.message : 'Error')
    } finally {
      setTopicsLoading(false)
    }
  }

  // --- Topics neu berechnen (Full Recluster + Re-Label) ---
  async function recomputeTopics(threshold: number) {
    try {
      setTopicsRecomputing(true)
      setTopicsError(null)
      const result = await post<{ status: string; overview?: TopicsOverview }>(
        '/api/journal/insights/topics/recompute',
        { threshold, language }
      )
      if (result.overview) {
        setTopicsOverview(result.overview)
        topicsLoadedRef.current = true
      }
    } catch (err) {
      setTopicsError(err instanceof Error ? err.message : 'Error')
    } finally {
      setTopicsRecomputing(false)
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

  // --- Pfad-Mapping: Default ist Journal-Insights, Overrides für Cross-Module-Endpoints ---
  function _insightPath(key: InsightKey): string {
    if (key === 'sport-correlation') {
      return `/api/insights/sport-correlation?days=30`
    }
    return `/api/journal/insights/${key}?language=${language}`
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
      const data = await post(_insightPath(key))
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
    setStorylines([])
    storylinesLoadedRef.current = false
    setStorylinesLoading(false)
    setStorylinesError(null)
    setTopicsOverview(null)
    topicsLoadedRef.current = false
    setTopicsLoading(false)
    setTopicsError(null)
    setTopicsRecomputing(false)
    setInsightResults({})
    setInsightLoading({})
    setInsightErrors({})
  }

  // --- Cache invalidieren (nach Entry-Änderung) ---
  function invalidateCache() {
    moodsLoadedRef.current = false
    storylinesLoadedRef.current = false
    topicsLoadedRef.current = false
    setInsightResults({})
  }

  return {
    // Moods
    moods, moodsLoaded: moodsLoadedRef.current, loadMoods,
    // Topics (neue Pipeline)
    topicsOverview, topicsLoading, topicsError, topicsRecomputing,
    loadTopics, recomputeTopics,
    // Storylines
    storylines, storylinesLoading, storylinesError, loadStorylines,
    // Insights
    insightResults, insightLoading, insightErrors, loadInsight,
    // Aktionen
    resetAnalytics, invalidateCache,
  }
}
