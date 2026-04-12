// OntologyEditModal — Bearbeiten von Ontology-Relationen oder Metis-Edges
// Ontology: Typ-Dropdown + Begründung (PUT /api/relations/:id)
// Metis: Typ-Dropdown + Begründung (PUT /api/metis/edges/:id)

import { useState, useEffect } from 'react'
import { put, get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { RelationType } from '../../types/relations'

interface RelationEdit {
  mode: 'relation'
  id: number
  sourceTitle: string
  targetTitle: string
  typeId: number
  reason: string
}

interface MetisEdgeEdit {
  mode: 'metis'
  id: number
  sourceTitle: string
  targetTitle: string
  relationType: string
  reason: string
}

export type EditTarget = RelationEdit | MetisEdgeEdit

interface Props {
  target: EditTarget
  onClose: () => void
  onSaved: () => void
}

export default function OntologyEditModal({ target, onClose, onSaved }: Props) {
  const { language } = useLanguage()
  const [types, setTypes] = useState<RelationType[]>([])
  const [saving, setSaving] = useState(false)

  // Ontology: Typ-ID, Metis: relation_type String
  const [typeId, setTypeId] = useState(
    target.mode === 'relation' ? target.typeId : 0
  )
  const [_relType] = useState(
    target.mode === 'metis' ? target.relationType : ''
  )
  const [reason, setReason] = useState(target.reason || '')

  // Relationstypen laden
  useEffect(() => {
    get<RelationType[]>('/api/relation-types').then(data => {
      setTypes(data)
      // Metis: String zu ID matchen für initiale Selektion
      if (target.mode === 'metis') {
        const match = data.find(t => t.name === target.relationType)
        if (match) setTypeId(match.id)
      }
    }).catch(console.error)
  }, [target])

  // Speichern
  const handleSave = async () => {
    setSaving(true)
    try {
      if (target.mode === 'relation') {
        await put(`/api/relations/${target.id}`, {
          relation_type_id: typeId,
          reason: reason.trim() || null,
        })
      } else {
        // Metis-Edge: ID zu Name auflösen
        const typeName = types.find(t => t.id === typeId)?.name || _relType
        await put(`/api/relations/${target.id}`, {
          relation_type: typeName,
          reason: reason.trim() || null,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('Speichern fehlgeschlagen:', err)
    } finally { setSaving(false) }
  }

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
        <h3 className="text-sm font-semibold mb-4"
          style={{ color: 'var(--color-text-primary)' }}>
          {target.mode === 'relation'
            ? (language === 'de' ? 'Relation bearbeiten' : 'Edit Relation')
            : (language === 'de' ? 'Metis-Link bearbeiten' : 'Edit Metis Link')}
        </h3>

        {/* Source → Target */}
        <div className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {target.sourceTitle} → {target.targetTitle}
        </div>

        {/* Typ-Dropdown */}
        <label className="block text-xs mb-1"
          style={{ color: 'var(--color-text-secondary)' }}>
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
        <label className="block text-xs mb-1"
          style={{ color: 'var(--color-text-secondary)' }}>
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
