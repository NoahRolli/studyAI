// OntologyPage — Vollbild-Wissensgraph aller typisierten Relationen
// Tabs: Übersicht (Ontology + bestätigte Metis), Vorschläge, Metis Links
// Bestätigte Metis-Edges erscheinen in Übersicht mit "via Metis" Badge

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { get } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import RelationSuggestions from '../components/relations/RelationSuggestions'
import MetisLinksTab from '../components/metis/MetisLinksTab'
import type { RelationData, RelationType } from '../types/relations'
import type { MetisEdge, MetisGraph, MetisNode } from '../types/metis'

export default function OntologyPage() {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [relations, setRelations] = useState<RelationData[]>([])
  const [types, setTypes] = useState<RelationType[]>([])
  const [metisConfirmed, setMetisConfirmed] = useState<{ edge: MetisEdge; src: MetisNode; tgt: MetisNode }[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'suggestions' | 'metis'>('overview')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('confirmed')

  const loadRelations = useCallback(async () => {
    try {
      const data = await get<RelationData[]>('/api/relations')
      setRelations(data)
    } catch (err) {
      console.error('Relationen laden fehlgeschlagen:', err)
    } finally { setLoading(false) }
  }, [])

  const loadTypes = useCallback(async () => {
    try {
      const data = await get<RelationType[]>('/api/relation-types')
      setTypes(data)
    } catch (err) {
      console.error('Typen laden fehlgeschlagen:', err)
    }
  }, [])

  // Bestätigte Metis-Edges für Overview laden
  const loadMetisConfirmed = useCallback(async () => {
    try {
      const graph = await get<MetisGraph>('/api/metis/graph')
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
      console.error('Metis-Graph laden fehlgeschlagen:', err)
    }
  }, [])

  useEffect(() => {
    loadRelations(); loadTypes(); loadMetisConfirmed()
  }, [loadRelations, loadTypes, loadMetisConfirmed])

  // Gefilterte Relationen
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
  const metisCount = metisConfirmed.length

  const tabs = [
    { key: 'overview' as const, label: language === 'de' ? 'Übersicht' : 'Overview' },
    { key: 'suggestions' as const, label: language === 'de' ? 'Vorschläge' : 'Suggestions' },
    { key: 'metis' as const, label: 'Metis Links' },
  ]

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="hud-title text-glow text-2xl mb-6">ONTOLOGY</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {language === 'de' ? 'Laden...' : 'Loading...'}
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header + Statistik */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hud-title text-glow text-2xl">ONTOLOGY</h1>
        <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{confirmed} {language === 'de' ? 'bestätigt' : 'confirmed'}</span>
          <span style={{ color: 'var(--color-warning)' }}>
            {suggested} {language === 'de' ? 'offen' : 'pending'}
          </span>
          {metisCount > 0 && (
            <span style={{ color: '#00d4ff' }}>
              {metisCount} via Metis
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}>
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`hud-tab ${activeTab === tab.key ? 'hud-tab-active' : ''}`}>
            {tab.label}
            {tab.key === 'suggestions' && suggested > 0 && (
              <span className="ml-1" style={{ color: 'var(--color-warning)' }}>
                ({suggested})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Übersicht — Ontology + bestätigte Metis */}
      {activeTab === 'overview' && (
        <div>
          {/* Filter */}
          <div className="flex gap-3 mb-4">
            <select value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="hud-input text-xs">
              <option value="all">{language === 'de' ? 'Alle Status' : 'All status'}</option>
              <option value="confirmed">{language === 'de' ? 'Bestätigt' : 'Confirmed'}</option>
              <option value="suggested">{language === 'de' ? 'Vorgeschlagen' : 'Suggested'}</option>
            </select>
            <select value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="hud-input text-xs">
              <option value="all">{language === 'de' ? 'Alle Typen' : 'All types'}</option>
              {types.map(t => (
                <option key={t.name} value={t.name}>
                  {language === 'de' ? t.label_de : t.label_en}
                </option>
              ))}
            </select>
          </div>

          {/* Ontology-Relationen */}
          {filteredRelations.length === 0 && metisConfirmed.length === 0 ? (
            <div className="hud-card p-8 text-center">
              <p style={{ color: 'var(--color-text-muted)' }}>
                {language === 'de'
                  ? 'Keine Relationen. Erstelle welche in Notes oder nutze Vorschläge.'
                  : 'No relations. Create some in Notes or use Suggestions.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
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
                    {typeLabel(r.relation_type)}
                  </span>
                  <span className="font-medium cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}
                    onDoubleClick={() => navigateToSource(r.target_type, r.target_id)}>
                    {r.target_title || `${r.target_type} #${r.target_id}`}
                  </span>
                  {r.reason && (
                    <span className="text-xs truncate max-w-48 ml-2"
                      style={{ color: 'var(--color-text-muted)' }}>
                      — {r.reason}
                    </span>
                  )}
                  <span className="ml-auto text-xs"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {r.created_by === 'ollama' ? 'AI' : ''}
                  </span>
                </div>
              ))}

              {/* Bestätigte Metis-Edges mit Badge */}
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
                      style={{ color: 'var(--color-text-muted)' }}>
                      — {edge.reason}
                    </span>
                  )}
                  <span className="ml-auto text-xs"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {(edge.strength * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Vorschläge */}
      {activeTab === 'suggestions' && (
        <RelationSuggestions onChanged={loadRelations} />
      )}

      {/* Tab: Metis Links */}
      {activeTab === 'metis' && (
        <MetisLinksTab />
      )}
    </div>
  )
}
