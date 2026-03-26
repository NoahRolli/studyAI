// MedicationForm — Formular zum Erstellen und Bearbeiten von Medikamenten
// Wird von MedicationTracker für "Neu" und "Bearbeiten" verwendet
// HUD-Design mit Glow-Effekten und Cyan-Akzenten

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import type { MedicationCreate } from '../../types/models'

interface MedicationFormProps {
  initialData?: MedicationCreate
  onSave: (data: MedicationCreate) => void
  onCancel: () => void
}

function MedicationForm({ initialData, onSave, onCancel }: MedicationFormProps) {
  const { t } = useLanguage()

  // Formular-State — entweder mit initialData (Edit) oder leer (Neu)
  const [form, setForm] = useState<MedicationCreate>(
    initialData || {
      name: '',
      dosage: '',
      frequency: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: null,
      notes: null,
    }
  )

  return (
    <div className="hud-card p-6 mb-6 animate-fade-in">
      <h2
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {initialData ? t.medication.formTitleEdit : t.medication.formTitleNew}
      </h2>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {t.medication.name}
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t.medication.namePlaceholder}
          className="hud-input"
        />
      </div>

      {/* Dosis + Frequenz nebeneinander */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {t.medication.dosage}
          </label>
          <input
            type="text"
            value={form.dosage}
            onChange={(e) => setForm({ ...form, dosage: e.target.value })}
            placeholder={t.medication.dosagePlaceholder}
            className="hud-input"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {t.medication.frequency}
          </label>
          <input
            type="text"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            placeholder={t.medication.frequencyPlaceholder}
            className="hud-input"
          />
        </div>
      </div>

      {/* Start + End-Datum nebeneinander */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {t.medication.startDate}
          </label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="hud-input"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {t.medication.endDate}
          </label>
          <input
            type="date"
            value={form.end_date || ''}
            onChange={(e) => setForm({ ...form, end_date: e.target.value || null })}
            className="hud-input"
          />
        </div>
      </div>

      {/* Notizen */}
      <div className="mb-6">
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {t.medication.notes}
        </label>
        <textarea
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
          placeholder={t.medication.notesPlaceholder}
          rows={3}
          className="hud-input resize-y"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={!form.name || !form.dosage || !form.frequency}
          className="hud-btn hud-btn-primary"
        >
          {t.common.save}
        </button>
        <button onClick={onCancel} className="hud-btn">
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}

export default MedicationForm