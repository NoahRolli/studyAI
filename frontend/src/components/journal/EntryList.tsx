// EntryList — Zeigt Journal-Einträge als Liste
// SICHERHEIT: Zeigt nur Datum + Titel — kein Content in der Übersicht!
// Content wird erst sichtbar wenn man den Eintrag zum Bearbeiten öffnet

import type { JournalEntry, JournalEntryCreate } from '../../types/models'
import EntryForm from './EntryForm'

interface EntryListProps {
  entries: JournalEntry[]
  editingId: number | null
  editEntry: JournalEntryCreate
  onStartEdit: (entry: JournalEntry) => void
  onSaveEdit: (data: JournalEntryCreate) => void
  onCancelEdit: () => void
  onDelete: (id: number) => void
}

function EntryList({
  entries,
  editingId,
  editEntry,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: EntryListProps) {
  // Leerer Zustand
  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-lg mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Noch keine Einträge.
        </p>
        <p style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
          Klicke auf "+ Neuer Eintrag" um zu beginnen.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="hud-card p-4 animate-fade-in">
          {/* Edit-Mode: EntryForm eingebettet */}
          {editingId === entry.id ? (
            <EntryForm
              initialData={editEntry}
              isEdit
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
            />
          ) : (
            /* Normale Ansicht: Nur Datum + Titel (kein Content!) */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {entry.date}
                </span>
                <h3
                  className="text-sm font-medium"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {entry.title}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onStartEdit(entry)}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => onDelete(entry.id)}
                  className="text-xs transition-colors"
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
          )}
        </div>
      ))}
    </div>
  )
}

export default EntryList