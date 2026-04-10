// KeyTermsEditor — Editierbare Key-Terms unter der Summary
// Loeschen per X-Button, Hinzufuegen per Input + Enter
// Speichert via PUT /api/summaries/{id}

import { useState } from 'react'
import { put } from '../../hooks/useAPI'

interface Props {
  summaryId: number
  terms: string[]
  onUpdated?: () => void
}

export default function KeyTermsEditor({ summaryId, terms, onUpdated }: Props) {
  const [localTerms, setLocalTerms] = useState(terms)
  const [newTerm, setNewTerm] = useState('')
  const [saving, setSaving] = useState(false)

  // Speichert aktualisierte Terms an Backend
  const saveTerms = async (updated: string[]) => {
    setSaving(true)
    try {
      await put(`/api/summaries/${summaryId}`, { key_terms: updated })
      setLocalTerms(updated)
      onUpdated?.()
    } catch (err) {
      console.error('Key terms speichern fehlgeschlagen:', err)
    } finally {
      setSaving(false)
    }
  }

  // Term entfernen
  const removeTerm = (index: number) => {
    const updated = localTerms.filter((_, i) => i !== index)
    saveTerms(updated)
  }

  // Neuen Term hinzufuegen
  const addTerm = () => {
    const trimmed = newTerm.trim().toLowerCase()
    if (!trimmed || localTerms.includes(trimmed)) {
      setNewTerm('')
      return
    }
    const updated = [...localTerms, trimmed]
    saveTerms(updated)
    setNewTerm('')
  }

  if (localTerms.length === 0 && !newTerm) {
    return (
      <div className="mt-3">
        <input
          value={newTerm}
          onChange={e => setNewTerm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTerm()}
          placeholder="+ Key term hinzufuegen..."
          className="hud-input text-xs py-1 px-2 w-48"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {localTerms.map((term, i) => (
        <span key={i} className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1.5 group"
          style={{
            backgroundColor: 'var(--color-hover-bg)',
            borderColor: 'var(--color-border-glow)',
            color: 'var(--color-text-secondary)',
            opacity: saving ? 0.5 : 1,
          }}>
          {term}
          <button
            onClick={() => removeTerm(i)}
            disabled={saving}
            className="opacity-0 group-hover:opacity-100 transition-opacity
              text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
            style={{ fontSize: '10px', lineHeight: 1 }}>
            x
          </button>
        </span>
      ))}
      <input
        value={newTerm}
        onChange={e => setNewTerm(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && addTerm()}
        onBlur={() => newTerm.trim() && addTerm()}
        placeholder="+"
        disabled={saving}
        className="text-xs py-1 px-2 bg-transparent border-none outline-none w-20"
        style={{ color: 'var(--color-text-muted)' }}
      />
    </div>
  )
}
