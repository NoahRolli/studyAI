// CalendarDayModal — Modal-Overlay für einen ausgewählten Kalender-Tag
// Zeigt bestehende Einträge (lesen/bearbeiten/löschen) + neuen erstellen
// Wird per Doppelklick auf einen Tag geöffnet

import { useState } from 'react'
import type { JournalEntry, JournalEntryCreate } from '../../types/models'
import EntryForm from './EntryForm'

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
}

function CalendarDayModal({
  selectedDate, entries, editingId, editEntry,
  onStartEdit, onSaveEdit, onCancelEdit, onDelete, onCreateEntry,
  autoTitle, onAutoTitleChange, onClose,
}: CalendarDayModalProps) {
  const [showNewForm, setShowNewForm] = useState(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      {/* Modal-Inhalt — Klick stoppt hier */}
      <div
        className="hud-card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 0 30px rgba(0, 255, 255, 0.15)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="hud-title text-base text-glow">
            {selectedDate}
          </h3>
          <button onClick={onClose} className="hud-btn px-2 py-1 text-xs">
            ✕
          </button>
        </div>

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
                      <h4
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {entry.title}
                      </h4>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onStartEdit(entry)}
                          className="text-xs"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => onDelete(entry.id)}
                          className="text-xs"
                          style={{ color: 'rgba(255, 59, 92, 0.4)' }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color = 'var(--color-danger)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = 'rgba(255, 59, 92, 0.4)')
                          }
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                    <p
                      className="whitespace-pre-wrap text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {entry.content}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Kein Eintrag vorhanden */}
        {entries.length === 0 && !showNewForm && (
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Keine Einträge für diesen Tag.
          </p>
        )}

        {/* Neuen Eintrag erstellen */}
        {!showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            className="hud-btn w-full"
          >
            + Neuer Eintrag
          </button>
        ) : (
          <EntryForm
            initialData={{ title: '', content: '', date: selectedDate }}
            autoTitle={autoTitle}
            onAutoTitleChange={onAutoTitleChange}
            onSave={(data) => {
              onCreateEntry(data)
              setShowNewForm(false)
            }}
            onCancel={() => setShowNewForm(false)}
          />
        )}
      </div>
    </div>
  )
}

export default CalendarDayModal