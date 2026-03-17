// Journal — Verschlüsseltes Tagebuch mit Analytics
// Drei Zustände: Setup → Unlock → Einträge + Analyse
//
// Analytics-Tabs (nur wenn entsperrt):
// - Einträge: Liste aller Tagebucheinträge
// - Stimmung: MoodChart (Verlauf über Zeit)
// - Themen: ClusterView (thematische Gruppen)
// - Storylines: StorylineView (narrative Bögen)

import { useState, useEffect } from 'react'
import { get, post, del } from '../hooks/useAPI'
import type { JournalStatus, JournalEntry, JournalEntryCreate } from '../types/models'
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
      setMessage(null)
      setActiveTab('entries')
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Sperren')
    }
  }

  async function createEntry() {
    try {
      setError(null)
      await post('/api/journal/entries/', newEntry)
      setNewEntry({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
      })
      setShowForm(false)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  async function deleteEntry(id: number) {
    try {
      await del(`/api/journal/entries/${id}`)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
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
                onClick={() => setActiveTab(tab.key)}
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
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Datum</label>
                    <input
                      type="date"
                      value={newEntry.date}
                      onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Titel</label>
                    <input
                      type="text"
                      value={newEntry.title}
                      onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                      placeholder="Was beschäftigt dich heute?"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
                    />
                  </div>
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
                  <button
                    onClick={createEntry}
                    disabled={!newEntry.title || !newEntry.content}
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
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">{entry.date}</span>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                      >
                        Löschen
                      </button>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{entry.title}</h3>
                    <p className="text-gray-400 whitespace-pre-wrap">{entry.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Stimmung */}
          {activeTab === 'mood' && <MoodChart entries={entries} />}

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