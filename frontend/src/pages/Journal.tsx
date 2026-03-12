// Journal — Verschlüsseltes Tagebuch
// Drei Zustände:
// 1. Nicht eingerichtet → Passwort-Setup Formular
// 2. Gesperrt → Passwort-Eingabe zum Entsperren
// 3. Entsperrt → Liste aller Einträge + Neuer Eintrag
//
// Die Verschlüsselung passiert im Backend:
// - Passwort wird geprüft via Argon2id
// - AES-256 Key wird im RAM gehalten
// - Einträge werden beim Senden verschlüsselt, beim Abrufen entschlüsselt

import { useState, useEffect } from 'react'
import { get, post, del } from '../hooks/useAPI'
import type { JournalStatus, JournalEntry, JournalEntryCreate } from '../types/models'

function Journal() {
  // --- State ---

  // Journal-Status: eingerichtet? entsperrt?
  const [status, setStatus] = useState<JournalStatus | null>(null)

  // Passwort-Eingabefeld (für Setup und Unlock)
  const [password, setPassword] = useState('')

  // Alle entschlüsselten Einträge (nur wenn entsperrt)
  const [entries, setEntries] = useState<JournalEntry[]>([])

  // Formular für neuen Eintrag
  const [showForm, setShowForm] = useState(false)
  const [newEntry, setNewEntry] = useState<JournalEntryCreate>({
    title: '',
    content: '',
    date: new Date().toISOString().split('T')[0], // Heutiges Datum
  })

  // UI-State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // --- API-Aufrufe ---

  // Status laden — wird beim ersten Rendern aufgerufen
  async function loadStatus() {
    try {
      setLoading(true)
      // GET /api/journal/status → {is_setup, is_unlocked}
      const data = await get<JournalStatus>('/api/journal/status')
      setStatus(data)

      // Wenn entsperrt, gleich die Einträge laden
      if (data.is_unlocked) {
        await loadEntries()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  // Einträge laden (nur wenn entsperrt)
  async function loadEntries() {
    try {
      // GET /api/journal/entries/ → Liste entschlüsselter Einträge
      const data = await get<JournalEntry[]>('/api/journal/entries/')
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Einträge')
    }
  }

  // Erstmaliges Passwort setzen
  async function setupJournal() {
    try {
      setError(null)
      // POST /api/journal/setup → Passwort hashen und speichern
      await post('/api/journal/setup', { password })
      setPassword('')
      setMessage('Journal eingerichtet! Bitte jetzt entsperren.')
      // Status neu laden
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Setup')
    }
  }

  // Journal entsperren
  async function unlockJournal() {
    try {
      setError(null)
      // POST /api/journal/unlock → Passwort prüfen, AES-Key in RAM
      await post('/api/journal/unlock', { password })
      setPassword('')
      setMessage(null)
      // Status und Einträge neu laden
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falsches Passwort')
    }
  }

  // Journal sperren (AES-Key aus RAM löschen)
  async function lockJournal() {
    try {
      // POST /api/journal/lock
      await post('/api/journal/lock')
      setEntries([])
      setMessage(null)
      // Status neu laden
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Sperren')
    }
  }

  // Neuen Eintrag erstellen (wird im Backend verschlüsselt)
  async function createEntry() {
    try {
      setError(null)
      // POST /api/journal/entries/ → Eintrag verschlüsseln und speichern
      await post('/api/journal/entries/', newEntry)

      // Formular zurücksetzen
      setNewEntry({
        title: '',
        content: '',
        date: new Date().toISOString().split('T')[0],
      })
      setShowForm(false)

      // Einträge neu laden
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  // Eintrag löschen (Soft-Delete)
  async function deleteEntry(id: number) {
    try {
      // DELETE /api/journal/entries/{id}
      await del(`/api/journal/entries/${id}`)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  // Status beim ersten Laden der Seite abrufen
  useEffect(() => {
    loadStatus()
  }, [])

  // --- Render ---

  // Ladebildschirm
  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Journal</h1>
        <p className="text-gray-400">Laden...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Journal</h1>

        {/* Sperren-Button — nur sichtbar wenn entsperrt */}
        {status?.is_unlocked && (
          <button
            onClick={lockJournal}
            className="bg-red-900/30 hover:bg-red-900/50 text-red-300 px-4 py-2 rounded-lg transition-colors"
          >
            Sperren
          </button>
        )}
      </div>

      {/* Fehlermeldung */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Erfolgsmeldung */}
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

            {/* Passwort-Eingabe */}
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

            {/* Setup-Button */}
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

      {/* --- ZUSTAND 2: Eingerichtet aber gesperrt → Unlock --- */}
      {status && status.is_setup && !status.is_unlocked && (
        <div className="max-w-md">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-2">Journal entsperren</h2>
            <p className="text-gray-400 text-sm mb-6">
              Gib dein Passwort ein um auf deine Einträge zuzugreifen.
            </p>

            {/* Passwort-Eingabe */}
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

            {/* Unlock-Button */}
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

      {/* --- ZUSTAND 3: Entsperrt → Einträge anzeigen --- */}
      {status?.is_unlocked && (
        <div>
          {/* Neuer Eintrag Button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors mb-6"
          >
            {showForm ? 'Abbrechen' : '+ Neuer Eintrag'}
          </button>

          {/* Formular für neuen Eintrag */}
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

              {/* Titel */}
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

              {/* Inhalt — textarea für längere Texte */}
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

              {/* Speichern-Button */}
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
                {/* Datum und Titel */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{entry.date}</span>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                  >
                    Löschen
                  </button>
                </div>

                {/* Titel */}
                <h3 className="text-lg font-semibold mb-2">{entry.title}</h3>

                {/* Inhalt — mit Zeilenumbrüchen */}
                <p className="text-gray-400 whitespace-pre-wrap">{entry.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Default Export — wird in App.tsx vom Router importiert
export default Journal