// MedicationReminder — Modal nach Journal-Unlock
// Zeigt offene Medikamente für heute an
// Erscheint nur wenn: Tracker aktiv + Medikamente heute nicht bestätigt
// Kann mit "Erledigt" oder "Später" geschlossen werden

import { useState, useEffect } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

// Typ für offene Medikamente vom Backend
interface PendingMed {
  id: number
  name: string
  dosage: string
}

interface MedicationReminderProps {
  show: boolean
  onDismiss: () => void
  onReloadMedications: () => void
}

function MedicationReminder({ show, onDismiss, onReloadMedications }: MedicationReminderProps) {
  const { t } = useLanguage()
  const [pending, setPending] = useState<PendingMed[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)

  // Offene Medikamente laden wenn Modal gezeigt wird
  useEffect(() => {
    if (!show) return
    loadPending()
  }, [show])

  async function loadPending() {
    try {
      setLoading(true)
      const data = await get<PendingMed[]>('/api/journal/medications/pending-today')
      setPending(data)
      // Keine offenen Medikamente → Modal gar nicht zeigen
      if (data.length === 0) onDismiss()
    } catch {
      // Fehler → Modal nicht zeigen (z.B. Tracker deaktiviert)
      onDismiss()
    } finally {
      setLoading(false)
    }
  }

  // Alle offenen Medikamente als "genommen" markieren
  async function confirmAll() {
    setConfirming(true)
    const today = new Date().toISOString().split('T')[0]
    try {
      for (const med of pending) {
        await post('/api/journal/medications/intake', {
          medication_id: med.id,
          date: today,
          status: 'taken',
        })
      }
      onReloadMedications()
      onDismiss()
    } catch {
      // Bei Fehler trotzdem schliessen
      onDismiss()
    } finally {
      setConfirming(false)
    }
  }

  // Nicht anzeigen wenn: nicht aktiv, lädt, oder keine offenen Meds
  if (!show || loading || pending.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
        onClick={onDismiss}
      />

      {/* Modal */}
      <div
        className="hud-card relative z-10 w-full max-w-md mx-4 p-6 animate-fade-in"
        style={{ boxShadow: 'var(--color-primary-glow)' }}
      >
        {/* Titel */}
        <h3
          className="hud-title text-sm mb-4"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.medReminder.title}
        </h3>

        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          {t.medReminder.description}
        </p>

        {/* Liste der offenen Medikamente */}
        <div className="space-y-2 mb-6">
          {pending.map((med) => (
            <div
              key={med.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderLeft: '3px solid var(--color-warning)',
              }}
            >
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {med.name}
              </span>
              <span
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {med.dosage}
              </span>
            </div>
          ))}
        </div>

        {/* Aktionen */}
        <div className="flex gap-3">
          <button
            onClick={confirmAll}
            disabled={confirming}
            className="hud-btn flex-1"
            style={{
              backgroundColor: 'var(--color-success)',
              color: '#000',
              opacity: confirming ? 0.6 : 1,
            }}
          >
            {confirming ? t.medReminder.confirming : t.medReminder.confirmAll}
          </button>
          <button
            onClick={onDismiss}
            className="hud-btn flex-1"
          >
            {t.medReminder.later}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MedicationReminder