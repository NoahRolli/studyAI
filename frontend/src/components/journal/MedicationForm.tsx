// MedicationForm — Formular zum Erstellen und Bearbeiten von Medikamenten
// Wird von MedicationTracker für "Neu" und "Bearbeiten" verwendet
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">
        {initialData ? 'Medikament bearbeiten' : 'Neues Medikament'}
      </h2>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="z.B. Ibuprofen"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
        />
      </div>

      {/* Dosis + Frequenz nebeneinander */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Dosis</label>
          <input
            type="text"
            value={form.dosage}
            onChange={(e) => setForm({ ...form, dosage: e.target.value })}
            placeholder="z.B. 400mg"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Frequenz</label>
          <input
            type="text"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            placeholder="z.B. 2x täglich"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
          />
        </div>
      </div>

      {/* Start + End-Datum nebeneinander */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Start-Datum</label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">End-Datum (optional)</label>
          <input
            type="date"
            value={form.end_date || ''}
            onChange={(e) => setForm({ ...form, end_date: e.target.value || null })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500"
          />
        </div>
      </div>

      {/* Notizen */}
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-1">
          Notizen / Nebenwirkungen (optional)
        </label>
        <textarea
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
          placeholder="z.B. Nicht auf leeren Magen nehmen..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500 resize-y"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={!form.name || !form.dosage || !form.frequency}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
        >
          Speichern
        </button>
        <button
          onClick={onCancel}
          className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}

export default MedicationForm