// OntologyEditModal — Bearbeiten einer Ontology-Relation
// Typ-Dropdown + Begründung editieren
// Wird aus OntologyOverview geöffnet

import { useState, useEffect } from 'react'
import { put, get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { RelationData, RelationType } from '../../types/relations'

interface Props {
  relation: RelationData
  onClose: () => void
  onSaved: () => void
}

export default function OntologyEditModal({ relation, onClose, onSaved }: Props) {
  const { language } = useLanguage()
  const [types, setTypes] = useState<RelationType[]>([])
  const [typeId, setTypeId] = useState(relation.relation_type_id)
  const [reason, setReason] = useState(relation.reason || '')
  const [saving, setSaving] = useState(false)

  // Relationstypen laden
  useEffect(() => {
    get<RelationType[]>('/api/relation-types').then(setTypes).catch(console.error)
  }, [])

  // Speichern
  const handleSave = async () => {
    setSaving(true)
    try {
      await put(`/api/relations/${relation.id}`, {
        relation_type_id: typeId,
        reason: reason.trim() || null,
      })
      onSaved()
      onClose()
    } catch (err) {
      console.error('Relation speichern fehlgeschlagen:', err)
    } finally {
      setSaving(false)
    }
  }

  // Overlay-Klick schliesst Modal
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div className="hud-card p-6" style={{ width: '400px', maxWidth: '90vw' }}>
        {/* Titel */}
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          {language === 'de' ? 'Relation bearbeiten' : 'Edit Relation'}
        </h3>

        {/* Source → Target (nur Anzeige) */}
        <div className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {relation.source_title || `${relation.source_type} #${relation.source_id}`}
          {' → '}
          {relation.target_title || `${relation.target_type} #${relation.target_id}`}
        </div>

        {/* Typ-Dropdown */}
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          {language === 'de' ? 'Typ' : 'Type'}
        </label>
        <select value={typeId} onChange={e => setTypeId(Number(e.target.value))}
          className="hud-input text-xs w-full mb-4">
          {types.map(t => (
            <option key={t.id} value={t.id}>
              {language === 'de' ? t.label_de : t.label_en}
            </option>
          ))}
        </select>

        {/* Begründung */}
        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          {language === 'de' ? 'Begründung' : 'Reason'}
        </label>
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          rows={3} className="hud-input text-xs w-full mb-4 resize-none"
          placeholder={language === 'de' ? 'Optional...' : 'Optional...'} />

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="hud-btn text-xs px-3 py-1">
            {language === 'de' ? 'Abbrechen' : 'Cancel'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="hud-btn text-xs px-3 py-1"
            style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}>
            {saving
              ? (language === 'de' ? 'Speichern...' : 'Saving...')
              : (language === 'de' ? 'Speichern' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
