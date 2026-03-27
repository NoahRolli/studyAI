// useJournalState — Zentraler State-Hook für das Journal
// Kapselt allen State, API-Aufrufe und Logik
// Journal.tsx importiert nur diesen Hook und verteilt die Daten
// language wird aus useLanguage geholt und an Backend-Calls angehängt

import { useState, useEffect } from 'react'
import { get, post, del, put } from './useAPI'
import { useLanguage } from './useLanguage'
import type {
  JournalStatus,
  JournalEntry,
  JournalEntryCreate,
  MoodResult,
  Medication,
  MedicationSettingsResponse,
} from '../types/models'

// Verfügbare Tabs im Journal
export type JournalTab =
  | 'entries'
  | 'calendar'
  | 'mood'
  | 'clusters'
  | 'storylines'
  | 'medications'

export default function useJournalState() {
  // Sprache aus Context holen — wird an API-Calls angehängt
  const { language } = useLanguage()

  // --- Core State ---
  const [status, setStatus] = useState<JournalStatus | null>(null)
  const [password, setPassword] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<JournalTab>('entries')

  // Formular-State
  const [showForm, setShowForm] = useState(false)
  const [autoTitle, setAutoTitle] = useState(true)

  // Edit-State
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<JournalEntryCreate>({
    title: '', content: '', date: '',
  })

  // Mood-Daten
  const [moods, setMoods] = useState<MoodResult[]>([])
  const [moodsLoaded, setMoodsLoaded] = useState(false)

  // Medikamenten-State
  const [medEnabled, setMedEnabled] = useState(false)
  const [medications, setMedications] = useState<Medication[]>([])

  // --- API-Aufrufe ---
  async function loadEntries() {
    try {
      const data = await get<JournalEntry[]>('/api/journal/entries/')
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading entries')
    }
  }

  async function loadMedSettings() {
    try {
      const data = await get<MedicationSettingsResponse>(
        '/api/journal/medications/settings'
      )
      setMedEnabled(data.is_enabled)
      if (data.is_enabled) await loadMedications()
    } catch {
      // Settings noch nicht verfügbar — ignorieren
    }
  }

  async function loadMedications() {
    try {
      const data = await get<Medication[]>('/api/journal/medications/')
      setMedications(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading medications')
    }
  }

  async function loadStatus() {
    try {
      setLoading(true)
      const data = await get<JournalStatus>('/api/journal/status')
      setStatus(data)
      if (data.is_unlocked) {
        await loadEntries()
        await loadMedSettings()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading status')
    } finally {
      setLoading(false)
    }
  }

  // --- Auth-Aktionen ---
  function resetState() {
    setEntries([])
    setMoods([])
    setMoodsLoaded(false)
    setMedications([])
    setMedEnabled(false)
    setMessage(null)
    setActiveTab('entries')
    setEditingId(null)
    setEditEntry({ title: '', content: '', date: '' })
    setStatus((prev) => prev ? { ...prev, is_unlocked: false } : prev)
  }

  async function setupJournal() {
    try {
      setError(null)
      await post('/api/journal/setup', { password })
      setPassword('')
      setMessage('Journal set up! Please unlock now.')
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    }
  }

  async function unlockJournal() {
    try {
      setError(null)
      await post('/api/journal/unlock', { password })
      setPassword('')
      setMessage(null)
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong password')
    }
  }

  async function lockJournal() {
    try {
      await post('/api/journal/lock')
      resetState()
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lock failed')
    }
  }

  // --- Entry-Aktionen ---
  // language wird als Query-Parameter an create angehängt (Auto-Titel)
  async function createEntry(data: JournalEntryCreate) {
    try {
      setError(null)
      const payload = {
        ...data,
        title: autoTitle ? null : data.title,
      }
      await post(`/api/journal/entries/?language=${language}`, payload)
      setShowForm(false)
      setAutoTitle(true)
      setMoodsLoaded(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating entry')
    }
  }

  async function deleteEntry(id: number) {
    try {
      await del(`/api/journal/entries/${id}`)
      setMoodsLoaded(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting entry')
    }
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id)
    setEditEntry({ title: entry.title, content: entry.content, date: entry.date })
    setShowForm(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditEntry({ title: '', content: '', date: '' })
  }

  async function saveEdit(data?: JournalEntryCreate) {
    if (!editingId) return
    try {
      setError(null)
      // Daten vom EntryForm verwenden falls übergeben, sonst editEntry State
      const payload = data || editEntry
      await put(`/api/journal/entries/${editingId}`, payload)
      cancelEdit()
      setMoodsLoaded(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving entry')
    }
  }

  // --- Mood --- language als Query-Parameter
  async function loadMoods() {
    if (moodsLoaded) return
    try {
      const data = await post<MoodResult[]>(
        `/api/journal/analytics/mood?language=${language}`
      )
      setMoods(data)
      setMoodsLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mood analysis failed')
    }
  }

  // --- Med-Toggle ---
  async function toggleMedTracker() {
    try {
      const data = await post<MedicationSettingsResponse>(
        '/api/journal/medications/settings/toggle'
      )
      setMedEnabled(data.is_enabled)
      if (data.is_enabled) {
        await loadMedications()
      } else {
        setMedications([])
        if (activeTab === 'medications') setActiveTab('entries')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    }
  }

  // --- Init ---
  useEffect(() => { loadStatus() }, [])

  return {
    // State
    status, password, setPassword, entries, loading, error, message,
    activeTab, setActiveTab, showForm, setShowForm, autoTitle, setAutoTitle,
    editingId, editEntry, setEditEntry, moods, moodsLoaded, medEnabled,
    medications,
    // Aktionen
    setupJournal, unlockJournal, lockJournal, resetState,
    createEntry, deleteEntry, startEdit, cancelEdit, saveEdit,
    loadMoods, loadMedications, toggleMedTracker,
  }
}