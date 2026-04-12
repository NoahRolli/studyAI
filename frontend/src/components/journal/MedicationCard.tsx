// MedicationCard — Einzelne Medikamenten-Karte mit Checkbox + Notiz
// Wird von MedicationTracker für jedes Medikament gerendert

import { useLanguage } from '../../hooks/useLanguage'
import type { Medication, MedicationCreate } from '../../types/models'
import MedicationForm from './MedicationForm'

interface Props {
  med: Medication
  todayStatus: string | null
  intakeNote: string
  isEditing: boolean
  isBackfilling: boolean
  backfillDate: string
  onToggleIntake: () => void
  onNoteChange: (val: string) => void
  onNoteSave: () => void
  onEdit: () => void
  onSave: (data: MedicationCreate) => void
  onCancelEdit: () => void
  onDelete: () => void
  onToggleBackfill: () => void
  onBackfillDateChange: (val: string) => void
  onBackfill: (status: string) => void
}

export default function MedicationCard({
  med, todayStatus, intakeNote, isEditing, isBackfilling,
  backfillDate, onToggleIntake, onNoteChange, onNoteSave,
  onEdit, onSave, onCancelEdit, onDelete,
  onToggleBackfill, onBackfillDateChange, onBackfill,
}: Props) {
  const { t } = useLanguage()
  const today = new Date().toISOString().split('T')[0]

  if (isEditing) {
    return (
      <div className="hud-card p-5 animate-fade-in">
        <MedicationForm
          initialData={{ name: med.name, dosage: med.dosage,
            frequency: med.frequency, start_date: med.start_date,
            end_date: med.end_date, notes: med.notes }}
          onSave={onSave} onCancel={onCancelEdit} />
      </div>
    )
  }

  return (
    <div className="hud-card p-5 animate-fade-in">
      {/* Header: Checkbox + Name + Buttons */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button onClick={onToggleIntake}
            className="w-6 h-6 rounded border-2 flex items-center justify-center
              transition-all duration-300"
            style={{
              borderColor: todayStatus === 'taken' ? 'var(--color-success)'
                : todayStatus === 'skipped' ? 'var(--color-danger)' : 'var(--color-border)',
              backgroundColor: todayStatus === 'taken' ? 'rgba(0,255,136,0.2)'
                : todayStatus === 'skipped' ? 'rgba(255,59,92,0.2)' : 'transparent',
              color: todayStatus === 'taken' ? 'var(--color-success)' : 'var(--color-danger)',
              boxShadow: todayStatus === 'taken' ? '0 0 10px rgba(0,255,136,0.3)'
                : todayStatus === 'skipped' ? '0 0 10px rgba(255,59,92,0.3)' : 'none',
            }}>
            {todayStatus === 'taken' && '✓'}
            {todayStatus === 'skipped' && '✕'}
          </button>
          <h3 className="text-base font-semibold"
            style={{ color: 'var(--color-text-primary)' }}>{med.name}</h3>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onToggleBackfill} className="text-xs transition-colors"
            style={{ color: isBackfilling ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
            {t.medication.backfill}</button>
          <button onClick={onEdit} className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}>{t.common.edit}</button>
          <button onClick={onDelete} className="text-xs"
            style={{ color: 'rgba(255,59,92,0.4)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,59,92,0.4)'}>
            {t.common.delete}</button>
        </div>
      </div>

      {/* Details */}
      <div className="flex gap-4 text-xs mb-2"
        style={{ color: 'var(--color-text-secondary)' }}>
        <span>{med.dosage}</span>
        <span style={{ color: 'var(--color-border)' }}>·</span>
        <span>{med.frequency}</span>
        <span style={{ color: 'var(--color-border)' }}>·</span>
        <span>{t.medication.since} {med.start_date}</span>
        {med.end_date && (<>
          <span style={{ color: 'var(--color-border)' }}>·</span>
          <span>{t.medication.until} {med.end_date}</span>
        </>)}
      </div>
      {med.notes && (
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {med.notes}</p>
      )}

      {/* Intake-Notiz (heute) */}
      {todayStatus && (
        <input type="text" value={intakeNote}
          onChange={e => onNoteChange(e.target.value)}
          onBlur={onNoteSave}
          placeholder={t.medication.notesPlaceholder || 'Notiz zur Einnahme...'}
          className="hud-input text-xs mt-2 w-full" />
      )}

      {/* Nachtragen */}
      {isBackfilling && (
        <div className="mt-4 pt-4 flex items-center gap-3 animate-fade-in"
          style={{ borderTop: '1px solid var(--color-border)' }}>
          <input type="date" value={backfillDate} max={today}
            onChange={e => onBackfillDateChange(e.target.value)}
            className="hud-input text-xs" style={{ width: '160px' }} />
          <button onClick={() => onBackfill('taken')}
            disabled={!backfillDate} className="hud-btn text-xs px-3 py-1"
            style={{ color: backfillDate ? 'var(--color-success)' : 'var(--color-text-muted)',
              borderColor: backfillDate ? 'var(--color-success)' : 'var(--color-border)' }}>
            ✓ {t.medication.taken}</button>
          <button onClick={() => onBackfill('skipped')}
            disabled={!backfillDate} className="hud-btn text-xs px-3 py-1"
            style={{ color: backfillDate ? 'var(--color-danger)' : 'var(--color-text-muted)',
              borderColor: backfillDate ? 'var(--color-danger)' : 'var(--color-border)' }}>
            ✕ {t.medication.skipped}</button>
        </div>
      )}
    </div>
  )
}
