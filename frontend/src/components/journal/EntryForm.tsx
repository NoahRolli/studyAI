// EntryForm — Formular für neue + bearbeitete Journal-Einträge
// Wiederverwendbar: Create-Mode (autoTitle möglich) + Edit-Mode

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
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
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}

function EntryForm({
  initialData,
  isEdit = false,
  autoTitle = false,
  onAutoTitleChange,
  onSave,
  onCancel,
  fullscreen,
  onToggleFullscreen,
}: EntryFormProps) {
  const { t } = useLanguage()

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

  const wrapperClass = fullscreen
    ? 'p-6 overflow-auto hud-grid-bg animate-fade-in'
    : 'hud-card p-6 mb-6 animate-fade-in'
  const wrapperStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg-deep)',
      }
    : {}

  return (
    <div className={`${wrapperClass} relative`} style={wrapperStyle}>
      {onToggleFullscreen && (
        <div className="absolute top-3 right-3 z-20">
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="hud-btn text-xs px-2 py-1"
            title={fullscreen ? 'Escape' : 'Fullscreen'}
          >{fullscreen ? '✖' : '⛶'}</button>
        </div>
      )}
      <h2
        className="hud-title text-sm mb-4"
        style={{ color: 'var(--color-primary)' }}
      >
        {isEdit ? t.entryForm.titleEdit : t.entryForm.titleNew}
      </h2>

      {/* Datum */}
      <div className="mb-4">
        <label
          className="block text-xs mb-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t.entryForm.dateLabel}
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
            {t.entryForm.titleLabel}
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
              {autoTitle ? t.entryForm.autoTitleOff : t.entryForm.autoTitleOn}
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
            {t.entryForm.autoTitleHint}
          </div>
        ) : (
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={isEdit ? t.entryForm.titlePlaceholderEdit : t.entryForm.titlePlaceholder}
            className="hud-input"
          />
        )}
      </div>

      {/* Inhalt */}
      <div className={fullscreen ? "mb-6 flex-1 flex flex-col" : "mb-6"}>
        <label
          className="block text-xs mb-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {t.entryForm.contentLabel}
        </label>
        <textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder={t.entryForm.contentPlaceholder}
          rows={fullscreen ? undefined : 6}
          className={fullscreen ? "hud-input flex-1 resize-none" : "hud-input resize-y"}
          style={fullscreen ? { minHeight: 0 } : {}}
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={!isValid}
          className="hud-btn hud-btn-primary"
        >
          {isEdit ? t.entryForm.saveEdit : t.entryForm.saveNew}
        </button>
        <button onClick={onCancel} className="hud-btn">
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}

export default EntryForm