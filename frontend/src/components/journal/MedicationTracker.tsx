// MedicationTracker — Medikamenten-Liste mit Einnahme-Tracking
// Zeigt alle aktiven Medikamente mit täglicher Checkbox (taken/skipped)
// Formular-Logik ist in MedicationForm.tsx ausgelagert

import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../hooks/useAPI'
import type { Medication, MedicationCreate, IntakeLog } from '../../types/models'
import MedicationForm from './MedicationForm'

interface MedicationTrackerProps {
  medications: Medication[]
  onReload: () => void
}

function MedicationTracker({ medications, onReload }: MedicationTrackerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intakeLogs, setIntakeLogs] = useState<Record<number, IntakeLog[]>>({})

  const today = new Date().toISOString().split('T')[0]

  // --- Einnahme-Logs laden ---
  async function loadIntakeLogs() {
    const logs: Record<number, IntakeLog[]> = {}
    for (const med of medications) {
      try {
        const data = await get<IntakeLog[]>(`/api/journal/medications/intake/${med.id}`)
        logs[med.id] = data
      } catch {
        logs[med.id] = []
      }
    }
    setIntakeLogs(logs)
  }

  useEffect(() => {
    if (medications.length > 0) loadIntakeLogs()
  }, [medications])

  // --- CRUD ---
  async function createMedication(data: MedicationCreate) {
    try {
      setError(null)
      await post('/api/journal/medications/', data)
      setShowForm(false)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    }
  }

  async function saveEdit(data: MedicationCreate) {
    if (!editingId) return
    try {
      setError(null)
      await put(`/api/journal/medications/${editingId}`, data)
      setEditingId(null)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  async function deleteMedication(id: number) {
    try {
      await del(`/api/journal/medications/${id}`)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  // --- Einnahme toggling ---
  async function toggleIntake(medId: number) {
    try {
      setError(null)
      const todayLog = (intakeLogs[medId] || []).find((l) => l.date === today)
      const newStatus = todayLog?.status === 'taken' ? 'skipped' : 'taken'
      await post('/api/journal/medications/intake', {
        medication_id: medId,
        date: today,
        status: newStatus,
      })
      await loadIntakeLogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Protokollieren')
    }
  }

  function getTodayStatus(medId: number): string | null {
    const todayLog = (intakeLogs[medId] || []).find((l) => l.date === today)
    return todayLog ? todayLog.status : null
  }

  // --- Render ---
  return (
    <div>
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Neues Medikament / Formular */}
      {showForm ? (
        <MedicationForm onSave={createMedication} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => { setShowForm(true); setEditingId(null) }}
          className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors mb-6"
        >
          + Neues Medikament
        </button>
      )}

      {/* Leerer Zustand */}
      {medications.length === 0 && !showForm && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-lg mb-2">Noch keine Medikamente.</p>
          <p className="text-gray-600">Klicke auf "+ Neues Medikament" um zu beginnen.</p>
        </div>
      )}

      {/* Medikamenten-Liste */}
      <div className="space-y-4">
        {medications.map((med) => (
          <div
            key={med.id}
            className="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors"
          >
            {editingId === med.id ? (
              <MedicationForm
                initialData={{
                  name: med.name,
                  dosage: med.dosage,
                  frequency: med.frequency,
                  start_date: med.start_date,
                  end_date: med.end_date,
                  notes: med.notes,
                }}
                onSave={saveEdit}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Einnahme-Checkbox */}
                    <button
                      onClick={() => toggleIntake(med.id)}
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                        getTodayStatus(med.id) === 'taken'
                          ? 'bg-green-600 border-green-600 text-white'
                          : getTodayStatus(med.id) === 'skipped'
                          ? 'bg-red-900/50 border-red-700 text-red-400'
                          : 'border-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {getTodayStatus(med.id) === 'taken' && '✓'}
                      {getTodayStatus(med.id) === 'skipped' && '✕'}
                    </button>
                    <h3 className="text-lg font-semibold">{med.name}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setEditingId(med.id); setShowForm(false) }}
                      className="text-xs text-gray-400/50 hover:text-gray-300 transition-colors"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => deleteMedication(med.id)}
                      className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-gray-400 mb-2">
                  <span>{med.dosage}</span>
                  <span>·</span>
                  <span>{med.frequency}</span>
                  <span>·</span>
                  <span>seit {med.start_date}</span>
                  {med.end_date && (
                    <>
                      <span>·</span>
                      <span>bis {med.end_date}</span>
                    </>
                  )}
                </div>
                {med.notes && (
                  <p className="text-sm text-gray-500 mt-2">{med.notes}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default MedicationTracker