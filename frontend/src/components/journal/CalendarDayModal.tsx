// CalendarDayModal — Modal-Overlay für einen ausgewählten Kalender-Tag
// NEU: Tab-Auswahl "Journal" | "Medikamente"
// Journal-Tab: Einträge lesen/bearbeiten/löschen + neu erstellen
// Medikamenten-Tab: Einnahme für diesen Tag nachtragen

import { useState } from 'react'
import { post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { JournalEntry, JournalEntryCreate, Medication } from '../../types/models'
import EntryForm from './EntryForm'

type ModalTab = 'journal' | 'medications'

interface CalendarDayModalProps {
  selectedDate: string
  entries: JournalEntry[]
  editingId: number | null
  editEntry: JournalEntryCreate
  onStartEdit: (entry: JournalEntry) => void
  onSaveEdit: (data: JournalEntryCreate) => void
  onCancelEdit: () => void
  onDelete: (id: number) => void
  onCreateEntry: (data: JournalEntryCreate) => void
  autoTitle: boolean
  onAutoTitleChange: (val: boolean) => void
  onClose: () => void
  medEnabled: boolean
  medications: Medication[]
}

function CalendarDayModal({
  selectedDate, entries, editingId, editEntry,
  onStartEdit, onSaveEdit, onCancelEdit, onDelete, onCreateEntry,
  autoTitle, onAutoTitleChange, onClose, medEnabled, medications,
}: CalendarDayModalProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<ModalTab>('journal')
  const [showNewForm, setShowNewForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMedIds, setSavedMedIds] = useState<Set<number>>(new Set())

  // --- Medikament nachtragen ---
  async function logIntake(medId: number, status: string) {
    try {
      setSaving(true)
      await post('/api/journal/medications/intake', {
        medication_id: medId,
        date: selectedDate,
        status,
      })
      setSavedMedIds((prev) => new Set(prev).add(medId))
    } catch {
      // Fehler still ignorieren
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      <div
        className="hud-card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 0 30px var(--color-highlight-glow)',
          border: '1px solid var(--color-highlight-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="hud-title text-base text-glow">{selectedDate}</h3>
          <button onClick={onClose} className="hud-btn px-2 py-1 text-xs">✕</button>
        </div>

        {/* Tabs — nur wenn Medikamente aktiviert */}
        {medEnabled && medications.length > 0 && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('journal')}
              className={activeTab === 'journal' ? 'hud-tab-active' : 'hud-tab'}
            >
              {t.journal.tabs.entries}
            </button>
            <button
              onClick={() => setActiveTab('medications')}
              className={activeTab === 'medications' ? 'hud-tab-active' : 'hud-tab'}
            >
              {t.journal.tabs.medications}
            </button>
          </div>
        )}

        {/* === Journal Tab === */}
        {activeTab === 'journal' && (
          <div>
            {/* Bestehende Einträge */}
            {entries.length > 0 && (
              <div className="space-y-3 mb-4">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg p-4"
                    style={{
                      backgroundColor: 'rgba(13, 17, 23, 0.5)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {editingId === entry.id ? (
                      <EntryForm
                        initialData={editEntry}
                        isEdit
                        onSave={onSaveEdit}
                        onCancel={onCancelEdit}
                      />
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium"
                            style={{ color: 'var(--color-text-primary)' }}>
                            {entry.title}
                          </h4>
                          <div className="flex items-center gap-3">
                            <button onClick={() => onStartEdit(entry)}
                              className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              {t.common.edit}
                            </button>
                            <button onClick={() => onDelete(entry.id)}
                              className="text-xs" style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')}>
                              {t.common.delete}
                            </button>
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-sm"
                          style={{ color: 'var(--color-text-secondary)' }}>
                          {entry.content}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {entries.length === 0 && !showNewForm && (
              <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
                {t.calendar.noEntries}
              </p>
            )}

            {!showNewForm ? (
              <button onClick={() => setShowNewForm(true)} className="hud-btn w-full">
                {t.common.newEntry}
              </button>
            ) : (
              <EntryForm
                initialData={{ title: '', content: '', date: selectedDate }}
                autoTitle={autoTitle}
                onAutoTitleChange={onAutoTitleChange}
                onSave={(data) => { onCreateEntry(data); setShowNewForm(false) }}
                onCancel={() => setShowNewForm(false)}
              />
            )}
          </div>
        )}

        {/* === Medikamenten Tab === */}
        {activeTab === 'medications' && (
          <div className="space-y-3">
            {medications.map((med) => (
              <div key={med.id} className="hud-card p-4 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}>
                      {med.name}
                    </h4>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {med.dosage} · {med.frequency}
                    </p>
                  </div>

                  {/* Status-Anzeige wenn gespeichert */}
                  {savedMedIds.has(med.id) && (
                    <span className="text-xs px-2 py-1 rounded"
                      style={{ color: 'var(--color-success)', background: 'rgba(0,255,136,0.1)' }}>
                      ✓ {t.medication.saved}
                    </span>
                  )}
                </div>

                {/* Taken / Skipped Buttons */}
                {!savedMedIds.has(med.id) && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => logIntake(med.id, 'taken')}
                      disabled={saving}
                      className="hud-btn text-xs px-4 py-1.5 flex-1"
                      style={{ color: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                    >
                      ✓ {t.medication.taken}
                    </button>
                    <button
                      onClick={() => logIntake(med.id, 'skipped')}
                      disabled={saving}
                      className="hud-btn text-xs px-4 py-1.5 flex-1"
                      style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                    >
                      ✕ {t.medication.skipped}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CalendarDayModal