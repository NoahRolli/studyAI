// Journal — Verschlüsseltes Tagebuch mit Analytics
// Drei Zustände: Setup → Unlock → Einträge + Analyse
//
// Analytics-Tabs (nur wenn entsperrt):
// - Einträge: Liste aller Tagebucheinträge
// - Stimmung: MoodChart (Verlauf über Zeit)
// - Themen: ClusterView (thematische Gruppen)
// - Storylines: StorylineView (narrative Bögen)

import { useState, useEffect } from 'react'
import { get, post, del, put } from '../hooks/useAPI'
import type { JournalStatus, JournalEntry, JournalEntryCreate, MoodResult } from '../types/models'
import MoodChart from '../components/journal/MoodChart'
import ClusterView from '../components/journal/ClusterView'
import StorylineView from '../components/journal/StorylineView'

// Verfügbare Tabs im entsperrten Zustand
type Tab = 'entries' | 'mood' | 'clusters' | 'storylines'

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

  // Edit-State: welcher Eintrag wird bearbeitet?
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<JournalEntryCreate>({
    title: '',
    content: '',
    date: '',
  })

  // Mood-Daten (werden einmal geladen und im Parent gehalten)
  const [moods, setMoods] = useState<MoodResult[]>([])
  const [moodsLoaded, setMoodsLoaded] = useState(false)

  // Auto-Titel Toggle (Standard: aktiviert = Ollama generiert)
  const [autoTitle, setAutoTitle] = useState(true)

  // Aktiver Tab (Standard: Einträge)
  const [activeTab, setActiveTab] = useState<Tab>('entries')

  // --- API-Aufrufe ---

  async function loadStatus() {
    try {
      setLoading(true)
      const data = await get<JournalStatus>('/api/journal/status')
      setStatus(data)
      if (data.is_unlocked) {
        await loadEntries()
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
      setEntries([])
      setMoods([])
      setMoodsLoaded(false)
      setMessage(null)
      setActiveTab('entries')
      cancelEdit()
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Sperren')
    }
  }

  async function createEntry() {
    try {
      setError(null)
      // Wenn autoTitle aktiv, title als null senden → Backend generiert
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

  // Eintrag zum Bearbeiten öffnen
  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id)
    setEditEntry({
      title: entry.title,
      content: entry.content,
      date: entry.date,
    })
    setShowForm(false)
  }

  // Bearbeitung abbrechen
  function cancelEdit() {
    setEditingId(null)
    setEditEntry({ title: '', content: '', date: '' })
  }

  // Eintrag speichern (PUT)
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

  // Mood-Daten laden (nur einmal pro Session)
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

  useEffect(() => {
    loadStatus()
  }, [])

  // --- Render ---

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Journal</h1>
        <p className="text-gray-400">Laden...</p>
      </div>
    )
  }

  // Tab-Konfiguration
  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Einträge' },
    { key: 'mood', label: 'Stimmung' },
    { key: 'clusters', label: 'Themen' },
    { key: 'storylines', label: 'Storylines' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Journal</h1>
        {status?.is_unlocked && (
          <button
            onClick={lockJournal}
            className="bg-red-900/30 hover:bg-red-900/50 text-red-300 px-4 py-2 rounded-lg transition-colors"
          >
            Sperren
          </button>
        )}
      </div>

      {/* Fehler- und Erfolgsmeldungen */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-800 text-green-300 px-4 py-3 rounded-lg mb-6">
          {message}
        </div>
      )}

      {/* --- ZUSTAND 1: Nicht eingerichtet → Setup --- */}
      {status && !status.is_setup && (
        <div className="max-w-md">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-2">Journal einrichten</h2>
            <p className="text-gray-400 text-sm mb-6">
              Setze ein Passwort für dein verschlüsseltes Tagebuch.
              Dieses Passwort kann nicht zurückgesetzt werden.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
              />
            </div>
            <button
              onClick={setupJournal}
              disabled={password.length < 8}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
            >
              Journal einrichten
            </button>
          </div>
        </div>
      )}

      {/* --- ZUSTAND 2: Gesperrt → Unlock --- */}
      {status && status.is_setup && !status.is_unlocked && (
        <div className="max-w-md">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-2">Journal entsperren</h2>
            <p className="text-gray-400 text-sm mb-6">
              Gib dein Passwort ein um auf deine Einträge zuzugreifen.
            </p>
            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort eingeben"
                onKeyDown={(e) => e.key === 'Enter' && unlockJournal()}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
              />
            </div>
            <button
              onClick={unlockJournal}
              disabled={!password}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
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
          <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key)
                  if (tab.key === 'mood') loadMoods()
                }}
                className={`px-4 py-2 rounded-md text-sm transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
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
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors mb-6"
              >
                {showForm ? 'Abbrechen' : '+ Neuer Eintrag'}
              </button>

              {/* Neuer Eintrag Formular */}
              {showForm && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
                  <h2 className="text-xl font-bold mb-4">Neuer Eintrag</h2>

                  {/* Datum */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Datum</label>
                    <input
                      type="date"
                      value={newEntry.date}
                      onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
                    />
                  </div>

                  {/* Titel mit Auto-Toggle */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm text-gray-400">Titel</label>
                      <button
                        type="button"
                        onClick={() => {
                          setAutoTitle(!autoTitle)
                          if (!autoTitle) setNewEntry({ ...newEntry, title: '' })
                        }}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {autoTitle ? '✎ Titel selbst eingeben' : '✕ Auto-Titel verwenden'}
                      </button>
                    </div>
                    {autoTitle ? (
                      <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-gray-500 text-sm">
                        Wird automatisch aus dem Inhalt generiert
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={newEntry.title}
                        onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                        placeholder="Eigenen Titel eingeben..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
                      />
                    )}
                  </div>

                  {/* Inhalt */}
                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-1">Inhalt</label>
                    <textarea
                      value={newEntry.content}
                      onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                      placeholder="Schreibe deine Gedanken auf..."
                      rows={6}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500 resize-y"
                    />
                  </div>

                  {/* Speichern */}
                  <button
                    onClick={createEntry}
                    disabled={!newEntry.content || (!autoTitle && !newEntry.title)}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
                  >
                    Eintrag speichern
                  </button>
                </div>
              )}

              {/* Leerer Zustand */}
              {entries.length === 0 && !showForm && (
                <div className="text-center py-16">
                  <p className="text-gray-500 text-lg mb-2">Noch keine Einträge.</p>
                  <p className="text-gray-600">Klicke auf "+ Neuer Eintrag" um zu beginnen.</p>
                </div>
              )}

              {/* Einträge-Liste */}
              <div className="space-y-4">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors"
                  >
                    {/* Bearbeitungsmodus */}
                    {editingId === entry.id ? (
                      <div>
                        <div className="mb-4">
                          <label className="block text-sm text-gray-400 mb-1">Datum</label>
                          <input
                            type="date"
                            value={editEntry.date}
                            onChange={(e) => setEditEntry({ ...editEntry, date: e.target.value })}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm text-gray-400 mb-1">Titel</label>
                          <input
                            type="text"
                            value={editEntry.title}
                            onChange={(e) => setEditEntry({ ...editEntry, title: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm text-gray-400 mb-1">Inhalt</label>
                          <textarea
                            value={editEntry.content}
                            onChange={(e) => setEditEntry({ ...editEntry, content: e.target.value })}
                            rows={6}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500 resize-y"
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={saveEdit}
                            disabled={!editEntry.title || !editEntry.content}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors text-sm"
                          >
                            Speichern
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors text-sm"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Anzeigemodus */
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-500">{entry.date}</span>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => startEdit(entry)}
                              className="text-xs text-gray-400/50 hover:text-gray-300 transition-colors"
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">{entry.title}</h3>
                        <p className="text-gray-400 whitespace-pre-wrap">{entry.content}</p>
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
        </div>
      )}
    </div>
  )
}

export default Journal