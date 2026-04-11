// ManualEdgeForm — Manuelle Edge zwischen zwei Konzepten erstellen
// Zwei Konzept-Dropdowns + Relationstyp + optionale Begruendung
// POST /api/concepts/edges (origin=manual, status=confirmed)

import { useState, useEffect } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { RelationType } from '../../types/relations'

interface ConceptItem {
  id: number
  name: string
}

interface Props {
  onCreated: () => void
}

export default function ManualEdgeForm({ onCreated }: Props) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [concepts, setConcepts] = useState<ConceptItem[]>([])
  const [types, setTypes] = useState<RelationType[]>([])
  const [sourceId, setSourceId] = useState(0)
  const [targetId, setTargetId] = useState(0)
  const [typeId, setTypeId] = useState(0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Konzepte + Typen laden wenn Form geoeffnet wird
  useEffect(() => {
    if (!open) return
    get<ConceptItem[]>('/api/concepts').then(data => {
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name))
      setConcepts(sorted)
    }).catch(console.error)
    get<RelationType[]>('/api/relation-types').then(data => {
      setTypes(data)
      if (data.length > 0 && typeId === 0) setTypeId(data[0].id)
    }).catch(console.error)
  }, [open])

  const handleSubmit = async () => {
    if (!sourceId || !targetId || !typeId) return
    if (sourceId === targetId) {
      setError(language === 'de' ? 'Selbst-Referenz nicht erlaubt' : 'Self-reference not allowed')
      return
    }
    setSaving(true)
    setError('')
    try {
      await post('/api/concepts/edges', {
        source_concept_id: sourceId,
        target_concept_id: targetId,
        relation_type_id: typeId,
        strength: 1.0,
        reason: reason.trim() || null,
      })
      // Reset
      setSourceId(0)
      setTargetId(0)
      setReason('')
      setOpen(false)
      onCreated()
    } catch (err: any) {
      const detail = err?.message || 'Fehler beim Erstellen'
      setError(detail.includes('409') 
        ? (language === 'de' ? 'Edge existiert bereits' : 'Edge already exists')
        : detail)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="hud-btn text-xs px-3 py-1.5"
        style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}>
        {language === 'de' ? '+ Manuelle Verbindung' : '+ Manual Connection'}
      </button>
    )
  }

  return (
    <div className="hud-card p-4 mb-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold"
          style={{ color: 'var(--color-text-primary)' }}>
          {language === 'de' ? 'Neue Verbindung' : 'New Connection'}
        </h4>
        <button onClick={() => { setOpen(false); setError('') }}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          x
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Source */}
        <div>
          <label className="block text-xs mb-1"
            style={{ color: 'var(--color-text-secondary)' }}>
            {language === 'de' ? 'Von' : 'From'}
          </label>
          <select value={sourceId} onChange={e => setSourceId(Number(e.target.value))}
            className="hud-input text-xs w-full">
            <option value={0}>--</option>
            {concepts.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {/* Target */}
        <div>
          <label className="block text-xs mb-1"
            style={{ color: 'var(--color-text-secondary)' }}>
            {language === 'de' ? 'Zu' : 'To'}
          </label>
          <select value={targetId} onChange={e => setTargetId(Number(e.target.value))}
            className="hud-input text-xs w-full">
            <option value={0}>--</option>
            {concepts.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Relationstyp */}
      <label className="block text-xs mb-1"
        style={{ color: 'var(--color-text-secondary)' }}>
        {language === 'de' ? 'Relationstyp' : 'Relation Type'}
      </label>
      <select value={typeId} onChange={e => setTypeId(Number(e.target.value))}
        className="hud-input text-xs w-full mb-3">
        {types.map(t => (
          <option key={t.id} value={t.id}>
            {language === 'de' ? t.label_de : t.label_en}
          </option>
        ))}
      </select>

      {/* Begruendung */}
      <label className="block text-xs mb-1"
        style={{ color: 'var(--color-text-secondary)' }}>
        {language === 'de' ? 'Begruendung (optional)' : 'Reason (optional)'}
      </label>
      <input value={reason} onChange={e => setReason(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        className="hud-input text-xs w-full mb-3"
        placeholder={language === 'de' ? 'Warum sind diese verbunden?' : 'Why are these connected?'} />

      {error && (
        <p className="text-xs mb-2" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}

      <button onClick={handleSubmit}
        disabled={saving || !sourceId || !targetId || !typeId}
        className="hud-btn hud-btn-primary text-xs px-3 py-1.5"
        style={{ opacity: (!sourceId || !targetId) ? 0.4 : 1 }}>
        {saving
          ? (language === 'de' ? 'Erstellen...' : 'Creating...')
          : (language === 'de' ? 'Verbindung erstellen' : 'Create Connection')}
      </button>
    </div>
  )
}
