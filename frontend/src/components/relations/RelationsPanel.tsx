// RelationsPanel — Zeigt und erstellt typisierte Relationen für eine Note
// Wird unterhalb des AI-Panels in der Notes-Ansicht angezeigt
// Bestätigte + vorgeschlagene Relationen, manuelles Erstellen

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, put, del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import type { RelationData, RelationType } from '../../types/relations'

interface Props {
  noteId: number
  onNavigate?: (noteId: number) => void
}

export default function RelationsPanel({ noteId, onNavigate }: Props) {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [relations, setRelations] = useState<RelationData[]>([])
  const [types, setTypes] = useState<RelationType[]>([])
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Formular-State
  const [targetType, setTargetType] = useState('note')
  const [targetId, setTargetId] = useState('')
  const [typeId, setTypeId] = useState<number>(0)
  const [reason, setReason] = useState('')

  const loadRelations = useCallback(async () => {
    try {
      const data = await get<RelationData[]>(
        `/api/relations?source_type=note&source_id=${noteId}`,
      )
      setRelations(data)
    } catch (err) {
      console.error('Relations laden fehlgeschlagen:', err)
    }
  }, [noteId])

  const loadTypes = useCallback(async () => {
    try {
      const data = await get<RelationType[]>('/api/relation-types')
      setTypes(data)
      if (data.length > 0 && typeId === 0) setTypeId(data[0].id)
    } catch (err) {
      console.error('Relationstypen laden fehlgeschlagen:', err)
    }
  }, [typeId])

  useEffect(() => { loadRelations() }, [loadRelations])
  useEffect(() => { loadTypes() }, [loadTypes])

  // Relation erstellen
  const handleCreate = async () => {
    const tid = parseInt(targetId)
    if (!tid || !typeId) return
    try {
      await post('/api/relations', {
        source_type: 'note', source_id: noteId,
        target_type: targetType, target_id: tid,
        relation_type_id: typeId,
        reason: reason || undefined,
      })
      setTargetId('')
      setReason('')
      setShowForm(false)
      loadRelations()
    } catch (err) {
      console.error('Relation erstellen fehlgeschlagen:', err)
    }
  }

  // Vorschlag bestätigen
  const handleConfirm = async (id: number) => {
    try {
      await put(`/api/relations/${id}/confirm`)
      loadRelations()
    } catch (err) {
      console.error('Bestätigung fehlgeschlagen:', err)
    }
  }

  // Vorschlag ablehnen
  const handleReject = async (id: number) => {
    try {
      await put(`/api/relations/${id}/reject`)
      loadRelations()
    } catch (err) {
      console.error('Ablehnung fehlgeschlagen:', err)
    }
  }

  // Relation löschen
  const handleDelete = async (id: number) => {
    try {
      await del(`/api/relations/${id}`)
      loadRelations()
    } catch (err) {
      console.error('Löschen fehlgeschlagen:', err)
    }
  }

  // Label je nach Sprache
  const typeLabel = (rt: { label_de: string; label_en: string } | null) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  // Relationen filtern (kein rejected)
  const visible = relations.filter(r => r.status !== 'rejected')
  const suggested = visible.filter(r => r.status === 'suggested')
  const confirmed = visible.filter(r => r.status === 'confirmed')

  // Ziel-Label (Note/Summary/Module + ID)
  const nodeLabel = (type: string, id: number, title?: string) => {
    if (title) return title
    const labels: Record<string, string> = {
      note: 'Note', summary: 'Summary', module: 'Module',
    }
    return `${labels[type] || type} #${id}`
  }


  // Doppelklick → zur Quelle navigieren
  const navigateToSource = (type: string, id: number) => {
    if (type === 'note') { onNavigate?.(id); return }
    if (type === 'summary' || type === 'module') navigate(`/modules/${id}`)
  }
  // Welche Seite ist das Gegenstück zu dieser Note?
  const otherSide = (r: RelationData): { type: string; id: number; title: string; direction: string } => {
    if (r.source_type === 'note' && r.source_id === noteId) {
      return { type: r.target_type, id: r.target_id, title: r.target_title, direction: '→' }
    }
    return { type: r.source_type, id: r.source_id, title: r.source_title, direction: '←' }
  }

  return (
    <div className="border-t border-[var(--color-border)] p-3">
      {/* Header — klickbar zum Auf/Zuklappen */}
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-secondary)' }}>
          {language === 'de' ? 'Relationen' : 'Relations'}
          {visible.length > 0 && ` (${visible.length})`}
          {suggested.length > 0 && (
            <span style={{ color: 'var(--color-warning)' }}>
              {` — ${suggested.length} ${language === 'de' ? 'Vorschläge' : 'suggestions'}`}
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {/* Bestätigte Relationen */}
          {confirmed.map(r => {
            const other = otherSide(r)
            return (
              <div key={r.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded"
                style={{ background: 'var(--color-hover-bg)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{other.direction}</span>
                <span className="font-medium" style={{ color: 'var(--color-primary)' }}>
                  {typeLabel(r.relation_type)}
                </span>
                <button className="hover:underline"
                  style={{ color: 'var(--color-text-primary)' }}
                  onDoubleClick={() => navigateToSource(other.type, other.id)}
                  title={r.reason || undefined}>
                  {nodeLabel(other.type, other.id, other.title)}
                </button>
                <span className="text-xs ml-1"
                  style={{ color: 'var(--color-text-muted)' }}>
                  {r.created_by === 'ollama' ? 'AI' : ''}
                </span>
                <button onClick={() => handleDelete(r.id)}
                  className="ml-auto text-xs opacity-40 hover:opacity-100"
                  style={{ color: 'var(--color-danger)' }}
                  title={language === 'de' ? 'Löschen' : 'Delete'}>
                  ✕
                </button>
              </div>
            )
          })}

          {/* Vorgeschlagene Relationen */}
          {suggested.map(r => {
            const other = otherSide(r)
            return (
              <div key={r.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded border"
                style={{
                  background: 'rgba(255, 170, 0, 0.05)',
                  borderColor: 'rgba(255, 170, 0, 0.2)',
                }}>
                <span style={{ color: 'var(--color-warning)' }}>?</span>
                <span className="font-medium" style={{ color: 'var(--color-warning)' }}>
                  {typeLabel(r.relation_type)}
                </span>
                <span className="cursor-pointer hover:underline" style={{ color: 'var(--color-text-primary)' }}
                  title={r.reason || undefined}
                  onDoubleClick={() => navigateToSource(other.type, other.id)}>
                  {nodeLabel(other.type, other.id, other.title)}
                </span>
                {r.reason && (
                  <span className="text-xs truncate max-w-32"
                    style={{ color: 'var(--color-text-muted)' }}>
                    — {r.reason}
                  </span>
                )}
                <div className="ml-auto flex gap-1">
                  <button onClick={() => handleConfirm(r.id)}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--color-success)' }}
                    title={language === 'de' ? 'Bestätigen' : 'Confirm'}>
                    ✓
                  </button>
                  <button onClick={() => handleReject(r.id)}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--color-danger)' }}
                    title={language === 'de' ? 'Ablehnen' : 'Reject'}>
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          {visible.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {language === 'de' ? 'Keine Relationen' : 'No relations'}
            </p>
          )}

          {/* Neue Relation erstellen */}
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="hud-btn text-xs mt-2">
              + {language === 'de' ? 'Relation hinzufügen' : 'Add relation'}
            </button>
          ) : (
            <div className="mt-2 p-2 rounded border border-[var(--color-border)] space-y-2">
              <div className="flex gap-2">
                <select value={targetType}
                  onChange={e => setTargetType(e.target.value)}
                  className="hud-input text-xs flex-shrink-0" style={{ width: '100px' }}>
                  <option value="note">Note</option>
                  <option value="summary">Summary</option>
                  <option value="module">Module</option>
                </select>
                <input type="number" value={targetId} placeholder="ID"
                  onChange={e => setTargetId(e.target.value)}
                  className="hud-input text-xs" style={{ width: '70px' }} />
                <select value={typeId}
                  onChange={e => setTypeId(parseInt(e.target.value))}
                  className="hud-input text-xs flex-1">
                  {types.map(t => (
                    <option key={t.id} value={t.id}>
                      {language === 'de' ? t.label_de : t.label_en}
                    </option>
                  ))}
                </select>
              </div>
              <input type="text" value={reason}
                placeholder={language === 'de' ? 'Begründung (optional)' : 'Reason (optional)'}
                onChange={e => setReason(e.target.value)}
                className="hud-input text-xs w-full" />
              <div className="flex gap-2">
                <button onClick={handleCreate} className="hud-btn text-xs">
                  {language === 'de' ? 'Erstellen' : 'Create'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
