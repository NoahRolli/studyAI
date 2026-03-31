// MedicationTracker — Medikamenten-Liste mit Einnahme-Tracking
// Zeigt alle aktiven Medikamente mit täglicher Checkbox (taken/skipped)
// NEU: Einnahmen können auch für vergangene Tage nachgetragen werden
// HUD-Design mit Glow-Effekten und Status-Farben

import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { Medication, MedicationCreate, IntakeLog } from '../../types/models'
import MedicationForm from './MedicationForm'

interface MedicationTrackerProps {
  medications: Medication[]
  onReload: () => void
}

function MedicationTracker({ medications, onReload }: MedicationTrackerProps) {
  const { t } = useLanguage()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intakeLogs, setIntakeLogs] = useState<Record<number, IntakeLog[]>>({})
  // NEU: State für Nachtragen-UI
  const [backfillId, setBackfillId] = useState<number | null>(null)
  const [backfillDate, setBackfillDate] = useState('')

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
      setError(err instanceof Error ? err.message : t.common.error)
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
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  async function deleteMedication(id: number) {
    try {
      await del(`/api/journal/medications/${id}`)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  // --- Einnahme toggling (heute) ---
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
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  // --- Einnahme nachtragen (vergangene Tage) ---
  async function submitBackfill(medId: number, status: string) {
    if (!backfillDate) return
    try {
      setError(null)
      await post('/api/journal/medications/intake', {
        medication_id: medId,
        date: backfillDate,
        status,
      })
      setBackfillId(null)
      setBackfillDate('')
      await loadIntakeLogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  // Heutigen Status ermitteln
  function getTodayStatus(medId: number): string | null {
    const todayLog = (intakeLogs[medId] || []).find((l) => l.date === today)
    return todayLog ? todayLog.status : null
  }

  return (
    <div>
      {/* Fehler */}
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

      {/* Neues Medikament / Formular */}
      {showForm ? (
        <MedicationForm onSave={createMedication} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => { setShowForm(true); setEditingId(null) }}
          className="hud-btn mb-6"
        >
          {t.medication.newMedication}
        </button>
      )}

      {/* Leerer Zustand */}
      {medications.length === 0 && !showForm && (
        <div className="text-center py-16">
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {t.medication.emptyTitle}
          </p>
          <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            {t.medication.emptyHint}
          </p>
        </div>
      )}

      {/* Medikamenten-Liste */}
      <div className="space-y-4">
        {medications.map((med) => (
          <div key={med.id} className="hud-card p-5 animate-fade-in">
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
                {/* Header: Checkbox + Name + Buttons */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleIntake(med.id)}
                      className="w-6 h-6 rounded border-2 flex items-center justify-center transition-all duration-300"
                      style={{
                        borderColor:
                          getTodayStatus(med.id) === 'taken'
                            ? 'var(--color-success)'
                            : getTodayStatus(med.id) === 'skipped'
                            ? 'var(--color-danger)'
                            : 'var(--color-border)',
                        backgroundColor:
                          getTodayStatus(med.id) === 'taken'
                            ? 'rgba(0, 255, 136, 0.2)'
                            : getTodayStatus(med.id) === 'skipped'
                            ? 'rgba(255, 59, 92, 0.2)'
                            : 'transparent',
                        color:
                          getTodayStatus(med.id) === 'taken'
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                        boxShadow:
                          getTodayStatus(med.id) === 'taken'
                            ? '0 0 10px rgba(0, 255, 136, 0.3)'
                            : getTodayStatus(med.id) === 'skipped'
                            ? '0 0 10px rgba(255, 59, 92, 0.3)'
                            : 'none',
                      }}
                    >
                      {getTodayStatus(med.id) === 'taken' && '✓'}
                      {getTodayStatus(med.id) === 'skipped' && '✕'}
                    </button>
                    <h3
                      className="text-base font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {med.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Nachtragen-Button */}
                    <button
                      onClick={() => {
                        setBackfillId(backfillId === med.id ? null : med.id)
                        setBackfillDate('')
                      }}
                      className="text-xs transition-colors"
                      style={{
                        color: backfillId === med.id
                          ? 'var(--color-primary)'
                          : 'var(--color-text-muted)',
                      }}
                    >
                      {t.medication.backfill}
                    </button>
                    <button
                      onClick={() => { setEditingId(med.id); setShowForm(false) }}
                      className="text-xs transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {t.common.edit}
                    </button>
                    <button
                      onClick={() => deleteMedication(med.id)}
                      className="text-xs transition-colors"
                      style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}
                    >
                      {t.common.delete}
                    </button>
                  </div>
                </div>

                {/* Medikament-Details */}
                <div className="flex gap-4 text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{med.dosage}</span>
                  <span style={{ color: 'var(--color-border)' }}>·</span>
                  <span>{med.frequency}</span>
                  <span style={{ color: 'var(--color-border)' }}>·</span>
                  <span>{t.medication.since} {med.start_date}</span>
                  {med.end_date && (
                    <>
                      <span style={{ color: 'var(--color-border)' }}>·</span>
                      <span>{t.medication.until} {med.end_date}</span>
                    </>
                  )}
                </div>

                {med.notes && (
                  <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                    {med.notes}
                  </p>
                )}

                {/* Nachtragen-UI (aufklappbar) */}
                {backfillId === med.id && (
                  <div
                    className="mt-4 pt-4 flex items-center gap-3 animate-fade-in"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                  >
                    <input
                      type="date"
                      value={backfillDate}
                      max={today}
                      onChange={(e) => setBackfillDate(e.target.value)}
                      className="hud-input text-xs"
                      style={{ width: '160px' }}
                    />
                    <button
                      onClick={() => submitBackfill(med.id, 'taken')}
                      disabled={!backfillDate}
                      className="hud-btn text-xs px-3 py-1"
                      style={{
                        color: backfillDate ? 'var(--color-success)' : 'var(--color-text-muted)',
                        borderColor: backfillDate ? 'var(--color-success)' : 'var(--color-border)',
                      }}
                    >
                      ✓ {t.medication.taken}
                    </button>
                    <button
                      onClick={() => submitBackfill(med.id, 'skipped')}
                      disabled={!backfillDate}
                      className="hud-btn text-xs px-3 py-1"
                      style={{
                        color: backfillDate ? 'var(--color-danger)' : 'var(--color-text-muted)',
                        borderColor: backfillDate ? 'var(--color-danger)' : 'var(--color-border)',
                      }}
                    >
                      ✕ {t.medication.skipped}
                    </button>
                  </div>
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