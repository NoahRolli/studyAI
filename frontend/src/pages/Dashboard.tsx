// Dashboard — Startseite mit Übersicht aller Studienmodule
// Lädt Module von der API (GET /api/modules/)
// Zeigt sie als HUD-Karten an mit Name und Beschreibung
// Enthält einen Button um neue Module zu erstellen
// Modul-Karten sind klickbar und führen zur Detailseite (/modules/:id)

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { get, post, del } from '../hooks/useAPI'
import type { Module, ModuleCreate } from '../types/models'

function Dashboard() {
  // --- State ---
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Formular-Daten — color wird unsichtbar mitgesendet (Backend braucht es)
  const [newModule, setNewModule] = useState<ModuleCreate>({
    name: '',
    description: '',
    color: '#00d4ff',
  })

  // --- API-Aufrufe ---
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

  useEffect(() => {
    loadModules()
  }, [])

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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="hud-title text-glow text-2xl">Dashboard</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="hud-btn"
        >
          {showForm ? 'Abbrechen' : '+ Neues Modul'}
        </button>
      </div>

      {/* Formular — ohne Farbwähler */}
      {showForm && (
        <div className="hud-card p-6 mb-8 animate-fade-in">
          <h2 className="hud-title text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            Neues Modul erstellen
          </h2>
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
          <div className="mb-6">
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
          <button
            onClick={createModule}
            disabled={!newModule.name}
            className="hud-btn hud-btn-primary"
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

      {loading && (
        <p style={{ color: 'var(--color-text-muted)' }}>Systeme werden geladen...</p>
      )}

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

      {/* Modul-Karten — ohne Farbbalken */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((module) => (
          <Link
            to={`/modules/${module.id}`}
            key={module.id}
            className="hud-card p-5 block animate-fade-in"
          >
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {module.name}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              {module.description}
            </p>
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