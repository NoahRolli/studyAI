// MedicationForm — Formular zum Erstellen und Bearbeiten von Medikamenten
// Wird von MedicationTracker für "Neu" und "Bearbeiten" verwendet
// HUD-Design mit Glow-Effekten und Cyan-Akzenten
//
// Props:
// - initialData: Vorbelegte Werte (beim Bearbeiten)
// - onSave: Callback mit den Formulardaten
// - onCancel: Abbrechen-Callback

import { useState } from 'react'
import type { MedicationCreate } from '../../types/models'

interface MedicationFormProps {
  initialData?: MedicationCreate
  onSave: (data: MedicationCreate) => void
  onCancel: () => void
}

function MedicationForm({ initialData, onSave, onCancel }: MedicationFormProps) {
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
        {initialData ? 'Medikament bearbeiten' : 'Neues Medikament'}
      </h2>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
          Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="z.B. Ibuprofen"
          className="hud-input"
        />
      </div>

      {/* Dosis + Frequenz nebeneinander */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Dosis
          </label>
          <input
            type="text"
            value={form.dosage}
            onChange={(e) => setForm({ ...form, dosage: e.target.value })}
            placeholder="z.B. 400mg"
            className="hud-input"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Frequenz
          </label>
          <input
            type="text"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            placeholder="z.B. 2x täglich"
            className="hud-input"
          />
        </div>
      </div>

      {/* Start + End-Datum nebeneinander */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Start-Datum
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
            End-Datum (optional)
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
          Notizen / Nebenwirkungen (optional)
        </label>
        <textarea
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
          placeholder="z.B. Nicht auf leeren Magen nehmen..."
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
          Speichern
        </button>
        <button onClick={onCancel} className="hud-btn">
          Abbrechen
        </button>
      </div>
    </div>
  )
}

export default MedicationForm