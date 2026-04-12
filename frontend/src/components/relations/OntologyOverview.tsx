// OntologyOverview — Uebersicht aller Wissensrelationen
// Zeigt manuelle + AI-bestaetigte + abgeleitete Relationen
// Hover-Icons: Bearbeiten + Loeschen. Inferred nicht editierbar.

import ManualEdgeForm from "./ManualEdgeForm"
import { useState, useEffect, useCallback } from 'react'
import { get, del } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import { getOntologyMarker } from '../../utils/ontologyMarkers'
import OntologyEditModal from './OntologyEditModal'
import type { EditTarget } from './OntologyEditModal'
import type { RelationData, RelationType } from '../../types/relations'

interface InferredRelation {
  source_type: string; source_id: number; source_title: string
  target_type: string; target_id: number; target_title: string
  relation_type: string
  labels: { label_de?: string; label_en?: string }
  chain_length: number; status: string
}

interface Props { showMarkers: boolean; onNodeFocus?: (key: string) => void }

function TypeSymbol({ type, show }: { type: string; show: boolean }) {
  if (!show) return null
  const marker = getOntologyMarker(type)
  if (!marker) return null
  return <span className="mr-1" style={{ color: marker.color, fontSize: '14px' }}>{marker.symbol}</span>
}

function RowActions({ onGraph, onEdit, onDelete }: {
  onGraph?: () => void; onEdit?: () => void; onDelete: () => void
}) {
  return (
    <span className="row-actions ml-auto flex gap-1 opacity-0 transition-opacity"
      style={{ flexShrink: 0 }}>
      {onGraph && (
        <button onClick={e => { e.stopPropagation(); onGraph() }}
          className="px-1.5 py-0.5 rounded text-xs hover:bg-white/10"
          style={{ color: "var(--color-primary)" }} title="Graph">{'\u25C9'}</button>
      )}
      {onEdit && (
        <button onClick={e => { e.stopPropagation(); onEdit() }}
          className="px-1.5 py-0.5 rounded text-xs hover:bg-white/10"
          style={{ color: 'var(--color-text-muted)' }} title="Edit">{'\u270E'}</button>
      )}
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        className="px-1.5 py-0.5 rounded text-xs hover:bg-white/10"
        style={{ color: '#ef4444' }} title="Delete">{'\u2715'}</button>
    </span>
  )
}

export default function OntologyOverview({ showMarkers, onNodeFocus }: Props) {
  const { language } = useLanguage()
  const [relations, setRelations] = useState<RelationData[]>([])
  const [types, setTypes] = useState<RelationType[]>([])
  const [inferred, setInferred] = useState<InferredRelation[]>([])
  const [filterType, setFilterType] = useState('all')
  const [filterOrigin, setFilterOrigin] = useState('all')
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [rels, typs, inf] = await Promise.all([
        get<RelationData[]>('/api/relations?status=confirmed'),
        get<RelationType[]>('/api/relation-types'),
        get<InferredRelation[]>('/api/relations/inferred'),
      ])
      setRelations(rels); setTypes(typs); setInferred(inf)
    } catch (err) { console.error('OntologyOverview laden fehlgeschlagen:', err) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const deleteRelation = async (id: number) => {
    const msg = language === 'de' ? 'Relation wirklich loeschen?' : 'Delete this relation?'
    if (!confirm(msg)) return
    try { await del(`/api/relations/${id}`); loadData() }
    catch (err) { console.error('Loeschen fehlgeschlagen:', err) }
  }

  const editRelation = (r: RelationData) => {
    setEditTarget({
      mode: 'relation', id: r.id,
      sourceTitle: r.source_title || `${r.source_type} #${r.source_id}`,
      targetTitle: r.target_title || `${r.target_type} #${r.target_id}`,
      typeId: r.relation_type?.id || 0,
      reason: r.reason || '',
    })
  }

  const filtered = relations.filter(r => {
    if (filterType !== 'all' && r.relation_type?.name !== filterType) return false
    if (filterOrigin !== 'all' && r.origin !== filterOrigin) return false
    return true
  })

  const typeLabel = (rt: RelationData['relation_type']) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  const manualCount = relations.filter(r => r.origin === 'manual').length
  const aiCount = relations.filter(r => r.origin !== 'manual').length

  return (
    <div>
      {/* Statistik */}
      <div className="flex gap-3 mb-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>{relations.length} {language === 'de' ? 'bestätigt' : 'confirmed'}</span>
        {manualCount > 0 && <span>{manualCount} {language === 'de' ? 'manuell' : 'manual'}</span>}
        {aiCount > 0 && (
          <span style={{ color: '#00d4ff' }}>{aiCount} via AI</span>
        )}
        {inferred.length > 0 && (
          <span style={{ color: '#4ade80' }}>
            {inferred.length} {language === 'de' ? 'abgeleitet' : 'inferred'}
          </span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)}
          className="hud-input text-xs">
          <option value="all">{language === 'de' ? 'Alle Quellen' : 'All origins'}</option>
          <option value="manual">{language === 'de' ? 'Manuell' : 'Manual'}</option>
          <option value="ai_auto_link">AI Auto-Link</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="hud-input text-xs">
          <option value="all">{language === 'de' ? 'Alle Typen' : 'All types'}</option>
          {types.map(t => (
            <option key={t.name} value={t.name}>
              {language === 'de' ? t.label_de : t.label_en}
            </option>
          ))}
        </select>
      </div>

      {/* Manuelle Edge erstellen */}
      <ManualEdgeForm onCreated={loadData} />

      <style>{`.onto-row:hover .row-actions { opacity: 1 !important; }`}</style>

      {filtered.length === 0 && inferred.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine Relationen. Erstelle welche oder nutze Vorschlaege.'
              : 'No relations. Create some or use Suggestions.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(r => (
            <div key={`rel-${r.id}`}
              className="onto-row flex items-center gap-2 text-sm px-3 py-2 rounded"
              style={{ background: 'var(--color-bg-surface)' }}>
              <span className="font-medium"
                style={{ color: 'var(--color-text-primary)' }}>
                {r.source_title || `concept #${r.source_id}`}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ color: 'var(--color-primary)', background: 'var(--color-hover-bg)' }}>
                <TypeSymbol type={r.relation_type?.name || ''} show={showMarkers} />
                {typeLabel(r.relation_type)}
              </span>
              <span className="font-medium"
                style={{ color: 'var(--color-text-primary)' }}>
                {r.target_title || `concept #${r.target_id}`}
              </span>
              {r.origin !== 'manual' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded ml-1"
                  style={{ color: '#00d4ff', background: '#00d4ff15',
                    border: '1px solid #00d4ff30' }}>
                  AI
                </span>
              )}
              {r.reason && (
                <span className="text-xs truncate max-w-48 ml-1"
                  style={{ color: 'var(--color-text-muted)' }}>— {r.reason}</span>
              )}
              <RowActions
                onGraph={() => onNodeFocus?.(`concept:${r.source_id}`)}
                onEdit={() => editRelation(r)}
                onDelete={() => deleteRelation(r.id)}
              />
            </div>
          ))}

          {inferred.map((inf, i) => (
            <div key={`inf-${i}`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded"
              style={{ background: 'rgba(74, 222, 128, 0.04)' }}>
              <span className="font-medium"
                style={{ color: 'var(--color-text-primary)' }}>
                {inf.source_title}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)' }}>
                <TypeSymbol type={inf.relation_type} show={showMarkers} />
                {language === 'de' ? inf.labels.label_de : inf.labels.label_en}
              </span>
              <span className="font-medium"
                style={{ color: 'var(--color-text-primary)' }}>
                {inf.target_title}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded ml-2"
                style={{ color: '#4ade80', background: '#4ade8015',
                  border: '1px solid #4ade8030' }}>
                {language === 'de' ? 'abgeleitet' : 'inferred'}
                {inf.chain_length > 0 && ` (${inf.chain_length})`}
              </span>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <OntologyEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={loadData}
        />
      )}
    </div>
  )
}
