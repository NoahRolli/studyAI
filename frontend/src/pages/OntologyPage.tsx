// OntologyPage — Vollbild-Wissensgraph aller typisierten Relationen
// Zeigt bestätigte + vorgeschlagene Relationen als Graph
// Integriert RelationSuggestions für Detect + Bestätigung

import { useState, useEffect, useCallback } from 'react'
import { get } from '../hooks/useAPI'
import { useLanguage } from '../hooks/useLanguage'
import RelationSuggestions from '../components/relations/RelationSuggestions'
import type { RelationData, RelationType } from '../types/relations'

// Node-Typ für die Übersicht
interface OntologyNode {
  key: string
  type: string
  id: number
  title: string
  relationCount: number
}

export default function OntologyPage() {
  const { language } = useLanguage()
  const [relations, setRelations] = useState<RelationData[]>([])
  const [types, setTypes] = useState<RelationType[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'graph' | 'suggestions'>('graph')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('confirmed')

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

  useEffect(() => { loadRelations(); loadTypes() }, [loadRelations, loadTypes])

  // Nodes aus Relationen extrahieren
  const nodes: OntologyNode[] = (() => {
    const map = new Map<string, OntologyNode>()
    const filtered = relations.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (filterType !== 'all' && r.relation_type?.name !== filterType) return false
      return true
    })
    for (const r of filtered) {
      const sKey = `${r.source_type}:${r.source_id}`
      const tKey = `${r.target_type}:${r.target_id}`
      if (!map.has(sKey)) {
        map.set(sKey, {
          key: sKey, type: r.source_type, id: r.source_id,
          title: sKey, relationCount: 0,
        })
      }
      if (!map.has(tKey)) {
        map.set(tKey, {
          key: tKey, type: r.target_type, id: r.target_id,
          title: tKey, relationCount: 0,
        })
      }
      map.get(sKey)!.relationCount++
      map.get(tKey)!.relationCount++
    }
    return Array.from(map.values()).sort((a, b) => b.relationCount - a.relationCount)
  })()

  // Gefilterte Relationen
  const filteredRelations = relations.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterType !== 'all' && r.relation_type?.name !== filterType) return false
    return true
  })

  const typeLabel = (rt: RelationData['relation_type']) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  const nodeLabel = (type: string, id: number) => {
    const labels: Record<string, string> = {
      note: 'Note', summary: 'Summary', module: 'Module',
    }
    return `${labels[type] || type} #${id}`
  }

  // Statistik
  const confirmed = relations.filter(r => r.status === 'confirmed').length
  const suggested = relations.filter(r => r.status === 'suggested').length
  const typeCount = new Set(relations.map(r => r.relation_type?.name)).size

  const tabs = [
    { key: 'graph' as const, label: language === 'de' ? 'Übersicht' : 'Overview' },
    { key: 'suggestions' as const, label: language === 'de' ? 'Vorschläge' : 'Suggestions' },
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
          <span>{nodes.length} Nodes</span>
          <span>{confirmed} {language === 'de' ? 'bestätigt' : 'confirmed'}</span>
          <span style={{ color: 'var(--color-warning)' }}>
            {suggested} {language === 'de' ? 'offen' : 'pending'}
          </span>
          <span>{typeCount} {language === 'de' ? 'Typen' : 'types'}</span>
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

      {/* Tab: Übersicht */}
      {activeTab === 'graph' && (
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

          {/* Relationen-Liste als Tripel */}
          {filteredRelations.length === 0 ? (
            <div className="hud-card p-8 text-center">
              <p style={{ color: 'var(--color-text-muted)' }}>
                {language === 'de'
                  ? 'Keine Relationen. Erstelle welche in Notes oder nutze "Vorschläge" → "Relationen erkennen".'
                  : 'No relations. Create some in Notes or use "Suggestions" → "Detect Relations".'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredRelations.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded"
                  style={{
                    background: r.status === 'suggested'
                      ? 'rgba(255, 170, 0, 0.05)' : 'var(--color-bg-surface)',
                  }}>
                  {/* Subjekt */}
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {nodeLabel(r.source_type, r.source_id)}
                  </span>
                  {/* Prädikat */}
                  <span className="px-2 py-0.5 rounded text-xs font-semibold"
                    style={{
                      color: r.status === 'suggested' ? 'var(--color-warning)' : 'var(--color-primary)',
                      background: r.status === 'suggested'
                        ? 'rgba(255, 170, 0, 0.1)' : 'var(--color-hover-bg)',
                    }}>
                    {typeLabel(r.relation_type)}
                  </span>
                  {/* Objekt */}
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {nodeLabel(r.target_type, r.target_id)}
                  </span>
                  {/* Begründung */}
                  {r.reason && (
                    <span className="text-xs truncate max-w-64 ml-2"
                      style={{ color: 'var(--color-text-muted)' }}>
                      — {r.reason}
                    </span>
                  )}
                  {/* Quelle */}
                  <span className="ml-auto text-xs"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {r.created_by === 'ollama' ? 'AI' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Node-Übersicht */}
          {nodes.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--color-text-secondary)' }}>
                {language === 'de' ? 'Vernetzte Nodes' : 'Connected Nodes'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {nodes.map(n => (
                  <span key={n.key} className="px-2 py-1 rounded text-xs"
                    style={{
                      background: 'var(--color-bg-elevated)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}>
                    {nodeLabel(n.type, n.id)}
                    <span className="ml-1" style={{ color: 'var(--color-text-muted)' }}>
                      ({n.relationCount})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Vorschläge */}
      {activeTab === 'suggestions' && (
        <RelationSuggestions onChanged={loadRelations} />
      )}
    </div>
  )
}
