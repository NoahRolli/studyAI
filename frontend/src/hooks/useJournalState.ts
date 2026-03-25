// useJournalState — Zentraler State-Hook für das Journal
// Kapselt allen State, API-Aufrufe und Logik
// Journal.tsx importiert nur diesen Hook und verteilt die Daten

import { useState, useEffect } from 'react'
import { get, post, del, put } from './useAPI'
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
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Einträge')
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
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Medikamente')
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
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
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
      setMessage('Journal eingerichtet! Bitte jetzt entsperren.')
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Setup')
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
      setError(err instanceof Error ? err.message : 'Falsches Passwort')
    }
  }

  async function lockJournal() {
    try {
      await post('/api/journal/lock')
      resetState()
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Sperren')
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
      await post('/api/journal/entries/', payload)
      setShowForm(false)
      setAutoTitle(true)
      setMoodsLoaded(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  async function deleteEntry(id: number) {
    try {
      await del(`/api/journal/entries/${id}`)
      setMoodsLoaded(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
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

  async function saveEdit() {
    if (!editingId) return
    try {
      setError(null)
      await put(`/api/journal/entries/${editingId}`, editEntry)
      cancelEdit()
      setMoodsLoaded(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  // --- Mood ---
  async function loadMoods() {
    if (moodsLoaded) return
    try {
      const data = await post<MoodResult[]>('/api/journal/analytics/mood')
      setMoods(data)
      setMoodsLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mood-Analyse fehlgeschlagen')
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
      setError(err instanceof Error ? err.message : 'Fehler beim Umschalten')
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