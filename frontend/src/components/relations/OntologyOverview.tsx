// OntologyOverview — Übersicht aller Wissensrelationen
// Ontology (manuell/AI), bestätigte Metis-Edges, abgeleitete (inferred) Relationen
// Doppelklick auf Titel → Navigation zur Quelle

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import { getOntologyMarker } from '../../utils/ontologyMarkers'
import type { RelationData, RelationType } from '../../types/relations'
import type { MetisEdge, MetisGraph, MetisNode } from '../../types/metis'

interface InferredRelation {
  source_type: string; source_id: number; source_title: string
  target_type: string; target_id: number; target_title: string
  relation_type: string
  labels: { label_de?: string; label_en?: string }
  chain_length: number; status: string
}

interface Props {
  showMarkers: boolean
}

function TypeSymbol({ type, show }: { type: string; show: boolean }) {
  if (!show) return null
  const marker = getOntologyMarker(type)
  if (!marker) return null
  return (
    <span className="mr-1" style={{ color: marker.color, fontSize: '14px' }}>
      {marker.symbol}
    </span>
  )
}

export default function OntologyOverview({ showMarkers }: Props) {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [relations, setRelations] = useState<RelationData[]>([])
  const [types, setTypes] = useState<RelationType[]>([])
  const [metisConfirmed, setMetisConfirmed] = useState<
    { edge: MetisEdge; src: MetisNode; tgt: MetisNode }[]
  >([])
  const [inferred, setInferred] = useState<InferredRelation[]>([])
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('confirmed')

  const loadData = useCallback(async () => {
    try {
      const [rels, typs, graph, inf] = await Promise.all([
        get<RelationData[]>('/api/relations'),
        get<RelationType[]>('/api/relation-types'),
        get<MetisGraph>('/api/metis/graph'),
        get<InferredRelation[]>('/api/relations/inferred'),
      ])
      setRelations(rels)
      setTypes(typs)
      setInferred(inf)
      // Bestätigte Metis-Edges extrahieren
      const confirmed = graph.edges
        .filter(e => e.id > 0 && e.status === 'confirmed' && e.relation_type !== 'wikilink')
        .map(edge => ({
          edge,
          src: graph.nodes.find(n => n.id === edge.source_node_id)!,
          tgt: graph.nodes.find(n => n.id === edge.target_node_id)!,
        }))
        .filter(e => e.src && e.tgt)
      setMetisConfirmed(confirmed)
    } catch (err) {
      console.error('OntologyOverview laden fehlgeschlagen:', err)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filteredRelations = relations.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterType !== 'all' && r.relation_type?.name !== filterType) return false
    return true
  })

  const typeLabel = (rt: RelationData['relation_type']) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  const navigateToSource = (type: string, id: number) => {
    if (type === 'note') navigate(`/notes?open=${id}`)
    else if (type === 'summary' || type === 'module') navigate(`/modules/${id}`)
  }

  const navigateToNode = (node: MetisNode) => {
    if (node.type === 'note') navigate(`/notes?open=${node.source_id}`)
    else if (node.type === 'summary' && node.module_id) navigate(`/modules/${node.module_id}`)
  }

  // Statistik
  const confirmed = relations.filter(r => r.status === 'confirmed').length
  const suggested = relations.filter(r => r.status === 'suggested').length

  return (
    <div>
      {/* Statistik */}
      <div className="flex gap-3 mb-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>{confirmed} {language === 'de' ? 'bestätigt' : 'confirmed'}</span>
        {suggested > 0 && (
          <span style={{ color: 'var(--color-warning)' }}>{suggested} {language === 'de' ? 'offen' : 'pending'}</span>
        )}
        {metisConfirmed.length > 0 && (
          <span style={{ color: '#00d4ff' }}>{metisConfirmed.length} via Metis</span>
        )}
        {inferred.length > 0 && (
          <span style={{ color: '#4ade80' }}>{inferred.length} {language === 'de' ? 'abgeleitet' : 'inferred'}</span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="hud-input text-xs">
          <option value="all">{language === 'de' ? 'Alle Status' : 'All status'}</option>
          <option value="confirmed">{language === 'de' ? 'Bestätigt' : 'Confirmed'}</option>
          <option value="suggested">{language === 'de' ? 'Vorgeschlagen' : 'Suggested'}</option>
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

      {/* Liste */}
      {filteredRelations.length === 0 && metisConfirmed.length === 0 && inferred.length === 0 ? (
        <div className="hud-card p-8 text-center">
          <p style={{ color: 'var(--color-text-muted)' }}>
            {language === 'de'
              ? 'Keine Relationen. Erstelle welche in Notes oder nutze Vorschläge.'
              : 'No relations. Create some in Notes or use Suggestions.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Ontology-Relationen */}
          {filteredRelations.map(r => (
            <div key={`rel-${r.id}`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded"
              style={{
                background: r.status === 'suggested'
                  ? 'rgba(255, 170, 0, 0.05)' : 'var(--color-bg-surface)',
              }}>
              <span className="font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onDoubleClick={() => navigateToSource(r.source_type, r.source_id)}>
                {r.source_title || `${r.source_type} #${r.source_id}`}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{
                  color: r.status === 'suggested' ? 'var(--color-warning)' : 'var(--color-primary)',
                  background: r.status === 'suggested'
                    ? 'rgba(255, 170, 0, 0.1)' : 'var(--color-hover-bg)',
                }}>
                <TypeSymbol type={r.relation_type?.name || ''} show={showMarkers} />
                {typeLabel(r.relation_type)}
              </span>
              <span className="font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onDoubleClick={() => navigateToSource(r.target_type, r.target_id)}>
                {r.target_title || `${r.target_type} #${r.target_id}`}
              </span>
              {r.reason && (
                <span className="text-xs truncate max-w-48 ml-2"
                  style={{ color: 'var(--color-text-muted)' }}>— {r.reason}</span>
              )}
              <span className="ml-auto text-xs"
                style={{ color: 'var(--color-text-muted)' }}>
                {r.created_by === 'ollama' ? 'AI' : ''}
              </span>
            </div>
          ))}

          {/* Bestätigte Metis-Edges */}
          {metisConfirmed.map(({ edge, src, tgt }) => (
            <div key={`metis-${edge.id}`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded"
              style={{ background: 'var(--color-bg-surface)' }}>
              <span className="font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onDoubleClick={() => navigateToNode(src)}>
                {src.title}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ color: 'var(--color-primary)', background: 'var(--color-hover-bg)' }}>
                <TypeSymbol type={edge.relation_type} show={showMarkers} />
                {edge.relation_type}
              </span>
              <span className="font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onDoubleClick={() => navigateToNode(tgt)}>
                {tgt.title}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded ml-2"
                style={{ color: '#00d4ff', background: '#00d4ff15', border: '1px solid #00d4ff30' }}>
                via Metis
              </span>
              {edge.reason && (
                <span className="text-xs truncate max-w-48 ml-1"
                  style={{ color: 'var(--color-text-muted)' }}>— {edge.reason}</span>
              )}
              <span className="ml-auto text-xs"
                style={{ color: 'var(--color-text-muted)' }}>
                {(edge.strength * 100).toFixed(0)}%
              </span>
            </div>
          ))}

          {/* Abgeleitete (Inferred) Relationen */}
          {inferred.map((inf, i) => (
            <div key={`inf-${i}`}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded"
              style={{ background: 'rgba(74, 222, 128, 0.04)' }}>
              <span className="font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onDoubleClick={() => navigateToSource(inf.source_type, inf.source_id)}>
                {inf.source_title}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)' }}>
                <TypeSymbol type={inf.relation_type} show={showMarkers} />
                {language === 'de' ? inf.labels.label_de : inf.labels.label_en}
              </span>
              <span className="font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--color-text-primary)' }}
                onDoubleClick={() => navigateToSource(inf.target_type, inf.target_id)}>
                {inf.target_title}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded ml-2"
                style={{ color: '#4ade80', background: '#4ade8015', border: '1px solid #4ade8030' }}>
                {language === 'de' ? 'abgeleitet' : 'inferred'}
                {inf.chain_length > 0 && ` (${inf.chain_length})`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
