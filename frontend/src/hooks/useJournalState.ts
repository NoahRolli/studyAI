// useJournalState — Zentraler State-Hook für das Journal
// Kapselt allen State, API-Aufrufe und Logik
// Analytics-Daten werden an useJournalAnalytics delegiert
// Journal.tsx importiert nur diesen Hook und verteilt die Daten

import { useState, useEffect } from 'react'
import { get, post, del, put } from './useAPI'
import { useLanguage } from './useLanguage'
import useJournalAnalytics from './useJournalAnalytics'
import type {
  JournalStatus,
  JournalEntry,
  JournalEntryCreate,
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
  | 'insights'
  | 'medications'

export default function useJournalState() {
  // Sprache aus Context holen — wird an API-Calls angehängt
  const { language } = useLanguage()

  // Analytics-Hook — gecachte Moods, Clusters, Storylines, Insights
  const analytics = useJournalAnalytics()

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

  // Medikamenten-State
  const [medEnabled, setMedEnabled] = useState(false)
  const [medications, setMedications] = useState<Medication[]>([])

  // Medikamenten-Erinnerung — wird nach Unlock getriggert
  const [showMedReminder, setShowMedReminder] = useState(false)

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
    setMedications([])
    setMedEnabled(false)
    setMessage(null)
    setActiveTab('entries')
    setEditingId(null)
    setEditEntry({ title: '', content: '', date: '' })
    setShowMedReminder(false)
    setStatus((prev) => prev ? { ...prev, is_unlocked: false } : prev)
    analytics.resetAnalytics()
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
      setShowMedReminder(true)
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
      analytics.invalidateCache()
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating entry')
    }
  }

  async function deleteEntry(id: number) {
    try {
      await del(`/api/journal/entries/${id}`)
      analytics.invalidateCache()
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
      const payload = data || editEntry
      await put(`/api/journal/entries/${editingId}`, payload)
      cancelEdit()
      analytics.invalidateCache()
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving entry')
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

  function dismissMedReminder() {
    setShowMedReminder(false)
  }

  // --- Init ---
  useEffect(() => { loadStatus() }, [])

  return {
    // State
    status, password, setPassword, entries, loading, error, message,
    activeTab, setActiveTab, showForm, setShowForm, autoTitle, setAutoTitle,
    editingId, editEntry, setEditEntry, medEnabled, medications, showMedReminder,
    // Analytics (durchgereicht)
    analytics,
    // Aktionen
    setupJournal, unlockJournal, lockJournal, resetState,
    createEntry, deleteEntry, startEdit, cancelEdit, saveEdit,
    loadMedications, toggleMedTracker, dismissMedReminder,
  }
}
