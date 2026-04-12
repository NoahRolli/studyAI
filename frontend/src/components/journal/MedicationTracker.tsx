// MedicationTracker — Medikamenten-Liste mit Einnahme-Tracking
// Delegiert Darstellung an MedicationCard
// Dosis-Änderung löst DoseChangeModal aus

import { useState, useEffect } from 'react'
import { get, post, put, del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { Medication, MedicationCreate, IntakeLog } from '../../types/models'
import MedicationForm from './MedicationForm'
import MedicationCard from './MedicationCard'
import DoseChangeModal from './DoseChangeModal'

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
  const [backfillId, setBackfillId] = useState<number | null>(null)
  const [backfillDate, setBackfillDate] = useState('')
  const [intakeNotes, setIntakeNotes] = useState<Record<number, string>>({})
  const [doseChange, setDoseChange] = useState<{
    medId: number; medName: string; oldDosage: string
    newDosage: string; pendingData: MedicationCreate
  } | null>(null)

  const today = new Date().toISOString().split('T')[0]

  async function loadIntakeLogs() {
    const logs: Record<number, IntakeLog[]> = {}
    const notes: Record<number, string> = {}
    for (const med of medications) {
      try {
        const data = await get<IntakeLog[]>(`/api/journal/medications/intake/${med.id}`)
        logs[med.id] = data
        const todayLog = data.find(l => l.date === today)
        if (todayLog?.notes) notes[med.id] = todayLog.notes
      } catch { logs[med.id] = [] }
    }
    setIntakeLogs(logs)
    setIntakeNotes(notes)
  }

  useEffect(() => {
    if (medications.length > 0) loadIntakeLogs()
  }, [medications])

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
    const med = medications.find(m => m.id === editingId)
    if (!med) return
    if (data.dosage !== med.dosage) {
      setDoseChange({ medId: editingId, medName: med.name,
        oldDosage: med.dosage, newDosage: data.dosage, pendingData: data })
      return
    }
    await submitEdit(editingId, data)
  }

  async function submitEdit(medId: number, data: MedicationCreate, reason?: string) {
    try {
      setError(null)
      await put(`/api/journal/medications/${medId}`, {
        ...data, dose_change_reason: reason || null })
      setEditingId(null)
      setDoseChange(null)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  async function toggleIntake(medId: number) {
    try {
      setError(null)
      const todayLog = (intakeLogs[medId] || []).find(l => l.date === today)
      const newStatus = todayLog?.status === 'taken' ? 'skipped' : 'taken'
      await post('/api/journal/medications/intake', {
        medication_id: medId, date: today, status: newStatus,
        notes: intakeNotes[medId] || null })
      await loadIntakeLogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  async function saveIntakeNote(medId: number) {
    const todayLog = (intakeLogs[medId] || []).find(l => l.date === today)
    if (!todayLog) return
    try {
      await post('/api/journal/medications/intake', {
        medication_id: medId, date: today,
        status: todayLog.status, notes: intakeNotes[medId] || null })
    } catch { /* Stille Fehler */ }
  }


  async function deleteMedication(id: number) {
    try {
      await del(`/api/journal/medications/${id}`)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }
  async function submitBackfill(medId: number, status: string) {
    if (!backfillDate) return
    try {
      setError(null)
      await post('/api/journal/medications/intake', {
        medication_id: medId, date: backfillDate, status })
      setBackfillId(null)
      setBackfillDate('')
      await loadIntakeLogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error)
    }
  }

  function getTodayStatus(medId: number): string | null {
    const todayLog = (intakeLogs[medId] || []).find(l => l.date === today)
    return todayLog ? todayLog.status : null
  }

  return (
    <div>
      {error && (
        <div className="px-4 py-3 rounded-lg mb-6 border"
          style={{ background: 'rgba(255,59,92,0.1)',
            borderColor: 'rgba(255,59,92,0.3)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}
      {showForm ? (
        <MedicationForm onSave={createMedication} onCancel={() => setShowForm(false)} />
      ) : (
        <button onClick={() => { setShowForm(true); setEditingId(null) }}
          className="hud-btn mb-6">{t.medication.newMedication}</button>
      )}
      {medications.length === 0 && !showForm && (
        <div className="text-center py-16">
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {t.medication.emptyTitle}</p>
          <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            {t.medication.emptyHint}</p>
        </div>
      )}
      <div className="space-y-4">
        {medications.map(med => (
          <MedicationCard key={med.id} med={med}
            todayStatus={getTodayStatus(med.id)}
            intakeNote={intakeNotes[med.id] || ''}
            isEditing={editingId === med.id}
            isBackfilling={backfillId === med.id}
            backfillDate={backfillDate}
            onToggleIntake={() => toggleIntake(med.id)}
            onNoteChange={val => setIntakeNotes(prev => ({ ...prev, [med.id]: val }))}
            onNoteSave={() => saveIntakeNote(med.id)}
            onEdit={() => { setEditingId(med.id); setShowForm(false) }}
            onSave={saveEdit}
            onCancelEdit={() => setEditingId(null)}
            onDelete={() => deleteMedication(med.id)}
            onToggleBackfill={() => {
              setBackfillId(backfillId === med.id ? null : med.id)
              setBackfillDate('')
            }}
            onBackfillDateChange={setBackfillDate}
            onBackfill={status => submitBackfill(med.id, status)}
          />
        ))}
      </div>
      {doseChange && (
        <DoseChangeModal medName={doseChange.medName}
          oldDosage={doseChange.oldDosage} newDosage={doseChange.newDosage}
          onConfirm={reason => submitEdit(doseChange.medId, doseChange.pendingData, reason)}
          onCancel={() => setDoseChange(null)} />
      )}
    </div>
  )
}

export default MedicationTracker
