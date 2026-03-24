// Journal — Verschlüsseltes Tagebuch mit Analytics + Medikamenten-Tracker
// Drei Zustände: Setup → Unlock → Einträge + Analyse
//
// Analytics-Tabs (nur wenn entsperrt):
// - Einträge: Liste aller Tagebucheinträge
// - Stimmung: MoodChart (Verlauf über Zeit)
// - Themen: ClusterView (thematische Gruppen)
// - Storylines: StorylineView (narrative Bögen)
// - Medikamente: MedicationTracker (nur wenn aktiviert)

import { useState, useEffect } from 'react'
import { get, post, del, put } from '../hooks/useAPI'
import type {
  JournalStatus,
  JournalEntry,
  JournalEntryCreate,
  MoodResult,
  Medication,
  MedicationSettingsResponse,
} from '../types/models'
import MoodChart from '../components/journal/MoodChart'
import ClusterView from '../components/journal/ClusterView'
import StorylineView from '../components/journal/StorylineView'
import MedicationTracker from '../components/journal/MedicationTracker'
import useJournalLock from '../hooks/useJournalLock'

// Verfügbare Tabs im entsperrten Zustand
type Tab = 'entries' | 'mood' | 'clusters' | 'storylines' | 'medications'

function Journal() {
  // --- State ---
  const [status, setStatus] = useState<JournalStatus | null>(null)
  const [password, setPassword] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newEntry, setNewEntry] = useState<JournalEntryCreate>({
    title: '',
    content: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Edit-State
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<JournalEntryCreate>({
    title: '',
    content: '',
    date: '',
  })

  // Mood-Daten
  const [moods, setMoods] = useState<MoodResult[]>([])
  const [moodsLoaded, setMoodsLoaded] = useState(false)

  // Auto-Titel Toggle
  const [autoTitle, setAutoTitle] = useState(true)

  // Medikamenten-Tracker State
  const [medEnabled, setMedEnabled] = useState(false)
  const [medications, setMedications] = useState<Medication[]>([])

  // Aktiver Tab
  const [activeTab, setActiveTab] = useState<Tab>('entries')

  // --- Auto-Lock: Sperrt Journal bei Navigation weg oder Laptop-Zuklappen ---
  // Setzt den kompletten Frontend-State zurück (Einträge, Moods, Medikamente)
  function handleAutoLocked() {
    setEntries([])
    setMoods([])
    setMoodsLoaded(false)
    setMedications([])
    setMedEnabled(false)
    setMessage(null)
    setActiveTab('entries')
    cancelEdit()
    setStatus((prev) => prev ? { ...prev, is_unlocked: false } : prev)
  }

  useJournalLock({
    isUnlocked: status?.is_unlocked ?? false,
    onLocked: handleAutoLocked,
    lockOnNavigateAway: true,
    lockOnVisibilityChange: true,
  })

  // --- API-Aufrufe ---
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
      const data = await get<MedicationSettingsResponse>('/api/journal/medications/settings')
      setMedEnabled(data.is_enabled)
      if (data.is_enabled) await loadMedications()
    } catch {
      // Settings-Endpoint noch nicht verfügbar — ignorieren
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
      handleAutoLocked()
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Sperren')
    }
  }

  async function createEntry() {
    try {
      setError(null)
      const payload = {
        ...newEntry,
        title: autoTitle ? null : newEntry.title,
      }
      await post('/api/journal/entries/', payload)
      setNewEntry({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
      })
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

  useEffect(() => { loadStatus() }, [])

  // --- Render ---
  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="hud-title text-glow text-2xl mb-6">Journal</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Systeme werden initialisiert...</p>
      </div>
    )
  }

  // Tab-Konfiguration (Medikamente nur wenn aktiviert)
  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Einträge' },
    { key: 'mood', label: 'Stimmung' },
    { key: 'clusters', label: 'Themen' },
    { key: 'storylines', label: 'Storylines' },
    ...(medEnabled ? [{ key: 'medications' as Tab, label: 'Medikamente' }] : []),
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="hud-title text-glow text-2xl">Journal</h1>
        {status?.is_unlocked && (
          <div className="flex items-center gap-4">
            {/* Medikamenten-Tracker Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={medEnabled}
                onChange={toggleMedTracker}
                className="w-4 h-4 rounded accent-[var(--color-primary)]"
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Medikamenten-Tracking
              </span>
            </label>
            <button onClick={lockJournal} className="hud-btn hud-btn-danger">
              Sperren
            </button>
          </div>
        )}
      </div>

      {/* Fehler- und Erfolgsmeldungen */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg mb-6 border"
          style={{
            background: 'rgba(255, 59, 92, 0.1)',
            borderColor: 'rgba(255, 59, 92, 0.3)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}
      {message && (
        <div
          className="px-4 py-3 rounded-lg mb-6 border"
          style={{
            background: 'rgba(0, 255, 136, 0.1)',
            borderColor: 'rgba(0, 255, 136, 0.3)',
            color: 'var(--color-success)',
          }}
        >
          {message}
        </div>
      )}

      {/* --- ZUSTAND 1: Setup --- */}
      {status && !status.is_setup && (
        <div className="max-w-md">
          <div className="hud-card p-6 animate-glow-pulse">
            <h2
              className="hud-title text-lg mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              Journal einrichten
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              Setze ein Passwort für dein verschlüsseltes Tagebuch.
              Dieses Passwort kann nicht zurückgesetzt werden.
            </p>
            <div className="mb-4">
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                className="hud-input"
              />
            </div>
            <button
              onClick={setupJournal}
              disabled={password.length < 8}
              className="hud-btn hud-btn-primary w-full"
            >
              Journal einrichten
            </button>
          </div>
        </div>
      )}

      {/* --- ZUSTAND 2: Unlock --- */}
      {status && status.is_setup && !status.is_unlocked && (
        <div className="max-w-md">
          <div className="hud-card p-6 animate-glow-pulse">
            <h2
              className="hud-title text-lg mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              Journal entsperren
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              Gib dein Passwort ein um auf deine Einträge zuzugreifen.
            </p>
            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort eingeben"
                onKeyDown={(e) => e.key === 'Enter' && unlockJournal()}
                className="hud-input"
              />
            </div>
            <button
              onClick={unlockJournal}
              disabled={!password}
              className="hud-btn hud-btn-primary w-full"
            >
              Entsperren
            </button>
          </div>
        </div>
      )}

      {/* --- ZUSTAND 3: Entsperrt → Tabs + Inhalte --- */}
      {status?.is_unlocked && (
        <div>
          {/* Tab-Navigation */}
          <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
            style={{ backgroundColor: 'var(--color-bg-surface)' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  if (tab.key === 'mood') loadMoods()
                }}
                className={`hud-tab ${activeTab === tab.key ? 'hud-tab-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Einträge */}
          {activeTab === 'entries' && (
            <div>
              <button
                onClick={() => setShowForm(!showForm)}
                className="hud-btn mb-6"
              >
                {showForm ? 'Abbrechen' : '+ Neuer Eintrag'}
              </button>

              {/* Neuer Eintrag Formular */}
              {showForm && (
                <div className="hud-card p-6 mb-6 animate-fade-in">
                  <h2
                    className="hud-title text-sm mb-4"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Neuer Eintrag
                  </h2>
                  <div className="mb-4">
                    <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                      Datum
                    </label>
                    <input
                      type="date"
                      value={newEntry.date}
                      onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                      className="hud-input"
                    />
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Titel
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setAutoTitle(!autoTitle)
                          if (!autoTitle) setNewEntry({ ...newEntry, title: '' })
                        }}
                        className="text-xs transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {autoTitle ? '✎ Titel selbst eingeben' : '✕ Auto-Titel verwenden'}
                      </button>
                    </div>
                    {autoTitle ? (
                      <div
                        className="rounded-md px-4 py-2 text-xs"
                        style={{
                          background: 'rgba(13, 17, 23, 0.5)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        Wird automatisch aus dem Inhalt generiert
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={newEntry.title}
                        onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                        placeholder="Eigenen Titel eingeben..."
                        className="hud-input"
                      />
                    )}
                  </div>
                  <div className="mb-6">
                    <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                      Inhalt
                    </label>
                    <textarea
                      value={newEntry.content}
                      onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                      placeholder="Schreibe deine Gedanken auf..."
                      rows={6}
                      className="hud-input resize-y"
                    />
                  </div>
                  <button
                    onClick={createEntry}
                    disabled={!newEntry.content || (!autoTitle && !newEntry.title)}
                    className="hud-btn hud-btn-primary"
                  >
                    Eintrag speichern
                  </button>
                </div>
              )}

              {/* Leerer Zustand */}
              {entries.length === 0 && !showForm && (
                <div className="text-center py-16">
                  <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Noch keine Einträge.
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                    Klicke auf "+ Neuer Eintrag" um zu beginnen.
                  </p>
                </div>
              )}

              {/* Einträge-Liste */}
              <div className="space-y-4">
                {entries.map((entry) => (
                  <div key={entry.id} className="hud-card p-5 animate-fade-in">
                    {editingId === entry.id ? (
                      <div>
                        <div className="mb-4">
                          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            Datum
                          </label>
                          <input
                            type="date"
                            value={editEntry.date}
                            onChange={(e) => setEditEntry({ ...editEntry, date: e.target.value })}
                            className="hud-input"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            Titel
                          </label>
                          <input
                            type="text"
                            value={editEntry.title}
                            onChange={(e) => setEditEntry({ ...editEntry, title: e.target.value })}
                            className="hud-input"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            Inhalt
                          </label>
                          <textarea
                            value={editEntry.content}
                            onChange={(e) => setEditEntry({ ...editEntry, content: e.target.value })}
                            rows={6}
                            className="hud-input resize-y"
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={saveEdit}
                            disabled={!editEntry.title || !editEntry.content}
                            className="hud-btn hud-btn-primary"
                          >
                            Speichern
                          </button>
                          <button onClick={cancelEdit} className="hud-btn">
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {entry.date}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => startEdit(entry)}
                              className="text-xs transition-colors"
                              style={{ color: 'var(--color-text-muted)' }}
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="text-xs transition-colors"
                              style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                          {entry.title}
                        </h3>
                        <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          {entry.content}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Stimmung */}
          {activeTab === 'mood' && (
            <MoodChart entries={entries} moods={moods} loading={!moodsLoaded && moods.length === 0} />
          )}

          {/* Tab: Themen */}
          {activeTab === 'clusters' && <ClusterView />}

          {/* Tab: Storylines */}
          {activeTab === 'storylines' && <StorylineView />}

          {/* Tab: Medikamente */}
          {activeTab === 'medications' && medEnabled && (
            <MedicationTracker medications={medications} onReload={loadMedications} />
          )}
        </div>
      )}
    </div>
  )
}

export default Journal