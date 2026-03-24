// Dashboard — Startseite mit Übersicht aller Studienmodule
// Lädt Module von der API (GET /api/modules/)
// Zeigt sie als HUD-Karten an mit Name, Beschreibung und Farbe
// Enthält einen Button um neue Module zu erstellen
// Modul-Karten sind klickbar und führen zur Detailseite (/modules/:id)

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { get, post, del } from '../hooks/useAPI'
import type { Module, ModuleCreate } from '../types/models'

function Dashboard() {
  // --- State ---

  // Liste aller Module (kommt von der API)
  const [modules, setModules] = useState<Module[]>([])

  // Ladezustand — zeigt Ladetext während der API-Call läuft
  const [loading, setLoading] = useState(true)

  // Fehlermeldung falls die API nicht erreichbar ist
  const [error, setError] = useState<string | null>(null)

  // Steuert ob das "Neues Modul"-Formular sichtbar ist
  const [showForm, setShowForm] = useState(false)

  // Formular-Daten für ein neues Modul
  const [newModule, setNewModule] = useState<ModuleCreate>({
    name: '',
    description: '',
    color: '#00d4ff',
  })

  // --- API-Aufrufe ---

  // Module laden — wird beim ersten Rendern aufgerufen (useEffect)
  async function loadModules() {
    try {
      setLoading(true)
      setError(null)
      const data = await get<Module[]>('/api/modules/')
      setModules(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  // Einmal beim Mounten laden
  useEffect(() => {
    loadModules()
  }, [])

  // Neues Modul erstellen
  async function createModule() {
    try {
      await post('/api/modules/', newModule)
      setNewModule({ name: '', description: '', color: '#00d4ff' })
      setShowForm(false)
      await loadModules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  // Modul löschen — stopPropagation verhindert Navigation zur Detailseite
  async function deleteModule(id: number, event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    try {
      await del(`/api/modules/${id}`)
      await loadModules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  // --- Render ---
  return (
    <div className="animate-fade-in">
      {/* Header mit Titel und Button */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="hud-title text-glow text-2xl">Dashboard</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="hud-btn"
        >
          {showForm ? 'Abbrechen' : '+ Neues Modul'}
        </button>
      </div>

      {/* Formular für neues Modul */}
      {showForm && (
        <div className="hud-card p-6 mb-8 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            Neues Modul erstellen
          </h2>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Name
            </label>
            <input
              type="text"
              value={newModule.name}
              onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
              placeholder="z.B. Lineare Algebra"
              className="hud-input"
            />
          </div>

          {/* Beschreibung */}
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Beschreibung
            </label>
            <input
              type="text"
              value={newModule.description}
              onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
              placeholder="z.B. Mathe Semester 2"
              className="hud-input"
            />
          </div>

          {/* Farbe */}
          <div className="mb-6">
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Farbe
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={newModule.color}
                onChange={(e) => setNewModule({ ...newModule, color: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border border-[var(--color-border)]"
              />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {newModule.color}
              </span>
            </div>
          </div>

          {/* Absenden */}
          <button
            onClick={createModule}
            disabled={!newModule.name}
            className="hud-btn-primary hud-btn"
          >
            Modul erstellen
          </button>
        </div>
      )}

      {/* Fehlermeldung */}
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

      {/* Ladezustand */}
      {loading && (
        <p style={{ color: 'var(--color-text-muted)' }}>Systeme werden geladen...</p>
      )}

      {/* Leerer Zustand */}
      {!loading && modules.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Keine Module vorhanden.
          </p>
          <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            Klicke auf "+ Neues Modul" um zu beginnen.
          </p>
        </div>
      )}

      {/* Modul-Karten — Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((module) => (
          <Link
            to={`/modules/${module.id}`}
            key={module.id}
            className="hud-card p-5 block animate-fade-in"
          >
            {/* Farbiger Balken oben — Modul-Farbe mit Glow */}
            <div
              className="h-1 rounded-full mb-4"
              style={{
                backgroundColor: module.color,
                boxShadow: `0 0 10px ${module.color}60`,
              }}
            />

            {/* Modul-Name */}
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {module.name}
            </h3>

            {/* Beschreibung */}
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              {module.description}
            </p>

            {/* Footer: Datum + Löschen */}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {new Date(module.created_at).toLocaleDateString('de-CH')}
              </span>
              <button
                onClick={(e) => deleteModule(module.id, e)}
                className="text-xs transition-colors"
                style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}
              >
                Löschen
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Dashboard