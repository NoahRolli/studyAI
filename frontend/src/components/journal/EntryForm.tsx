// EntryForm — Formular für neue + bearbeitete Journal-Einträge
// Wiederverwendbar: Create-Mode (autoTitle möglich) + Edit-Mode

import { useState } from 'react'
import type { JournalEntryCreate } from '../../types/models'

interface EntryFormProps {
  // Create-Mode: initialData ist leer, onSave erstellt neuen Eintrag
  // Edit-Mode: initialData hat Werte, onSave aktualisiert bestehenden
  initialData?: JournalEntryCreate
  isEdit?: boolean
  autoTitle?: boolean
  onAutoTitleChange?: (val: boolean) => void
  onSave: (data: JournalEntryCreate) => void
  onCancel: () => void
}

function EntryForm({
  initialData,
  isEdit = false,
  autoTitle = false,
  onAutoTitleChange,
  onSave,
  onCancel,
}: EntryFormProps) {
  // Lokaler Formular-State
  const [form, setForm] = useState<JournalEntryCreate>(
    initialData || {
      title: '',
      content: '',
      date: new Date().toISOString().split('T')[0],
    }
  )

  // Validierung: Content muss vorhanden sein, Titel wenn nicht autoTitle
  const isValid = form.content.trim() !== '' && (autoTitle || form.title.trim() !== '')

  return (
    <div className="hud-card p-6 mb-6 animate-fade-in">
      <h2
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {isEdit ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
      </h2>

      {/* Datum */}
      <div className="mb-4">
        <label
          className="block text-xs mb-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Datum
        </label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="hud-input"
        />
      </div>

      {/* Titel — mit Auto-Titel Toggle im Create-Mode */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Titel
          </label>
          {!isEdit && onAutoTitleChange && (
            <button
              type="button"
              onClick={() => {
                onAutoTitleChange(!autoTitle)
                if (!autoTitle) setForm({ ...form, title: '' })
              }}
              className="text-xs transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {autoTitle ? '✎ Titel selbst eingeben' : '✕ Auto-Titel verwenden'}
            </button>
          )}
        </div>
        {!isEdit && autoTitle ? (
          <div
            className="rounded-md px-4 py-2 text-xs"
            style={{
              background: 'rgba(13, 17, 23, 0.5)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
          >
            Wird automatisch aus dem Inhalt generiert
          </div>
        ) : (
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={isEdit ? 'Titel' : 'Eigenen Titel eingeben...'}
            className="hud-input"
          />
        )}
      </div>

      {/* Inhalt */}
      <div className="mb-6">
        <label
          className="block text-xs mb-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Inhalt
        </label>
        <textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="Schreibe deine Gedanken auf..."
          rows={6}
          className="hud-input resize-y"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={!isValid}
          className="hud-btn hud-btn-primary"
        >
          {isEdit ? 'Speichern' : 'Eintrag speichern'}
        </button>
        <button onClick={onCancel} className="hud-btn">
          Abbrechen
        </button>
      </div>
    </div>
  )
}

export default EntryForm