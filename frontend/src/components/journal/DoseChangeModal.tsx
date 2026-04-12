// DoseChangeModal — Fragt nach dem Grund einer Dosis-Änderung
// Wird angezeigt wenn im MedicationForm die Dosis geändert wird
// Speichert über den regulären Update-Endpoint (dose_change_reason Feld)

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'

interface Props {
  medName: string
  oldDosage: string
  newDosage: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}

export default function DoseChangeModal({
  medName, oldDosage, newDosage, onConfirm, onCancel,
}: Props) {
  const { t } = useLanguage()
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="hud-card p-6 w-96 animate-fade-in"
        style={{ borderColor: 'var(--color-primary)',
          boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)' }}>

        <h3 className="hud-title text-sm mb-4"
          style={{ color: 'var(--color-primary)' }}>
          {'Dosis-Aenderung'}
        </h3>

        <p className="text-xs mb-3"
          style={{ color: 'var(--color-text-secondary)' }}>
          <strong>{medName}</strong>
        </p>

        <div className="flex items-center gap-2 mb-4 text-xs"
          style={{ color: 'var(--color-text-muted)' }}>
          <span className="px-2 py-1 rounded"
            style={{ backgroundColor: 'rgba(255,59,92,0.1)',
              color: 'var(--color-danger)' }}>
            {oldDosage}
          </span>
          <span>&#8594;</span>
          <span className="px-2 py-1 rounded"
            style={{ backgroundColor: 'rgba(0,255,136,0.1)',
              color: 'var(--color-success)' }}>
            {newDosage}
          </span>
        </div>

        <label className="block text-xs mb-1"
          style={{ color: 'var(--color-text-muted)' }}>
          {'Warum aenderst du die Dosis?'}
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="z.B. Arzt empfohlen, Nebenwirkungen, bessere Wirkung..."


          rows={3}
          className="hud-input resize-y w-full mb-4"
          autoFocus
        />

        <div className="flex gap-3">
          <button onClick={() => onConfirm(reason)}
            className="hud-btn hud-btn-primary flex-1">
            {t.common?.save || 'Speichern'}
          </button>
          <button onClick={onCancel}
            className="hud-btn flex-1">
            {t.common?.cancel || 'Abbrechen'}
          </button>
        </div>
      </div>
    </div>
  )
}
