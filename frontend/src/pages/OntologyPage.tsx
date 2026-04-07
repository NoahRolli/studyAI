// OntologyPage — Vollbild-Wissensgraph aller typisierten Relationen
// Tabs: Übersicht (Ontology + Metis + Inferred), Vorschläge, Metis Links
// Ontologie-Symbole togglebar via localStorage

import { useState, useCallback } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import RelationSuggestions from '../components/relations/RelationSuggestions'
import MetisLinksTab from '../components/metis/MetisLinksTab'
import OntologyOverview from '../components/relations/OntologyOverview'
import { getMarkersVisible, setMarkersVisible } from '../utils/ontologyMarkers'

export default function OntologyPage() {
  const { language } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'suggestions' | 'metis'>('overview')
  const [showMarkers, setShowMarkers] = useState(getMarkersVisible)

  const toggleMarkers = useCallback(() => {
    setShowMarkers(prev => {
      setMarkersVisible(!prev)
      return !prev
    })
  }, [])

  const tabs = [
    { key: 'overview' as const, label: language === 'de' ? 'Übersicht' : 'Overview' },
    { key: 'suggestions' as const, label: language === 'de' ? 'Vorschläge' : 'Suggestions' },
    { key: 'metis' as const, label: 'Metis Links' },
  ]

  return (
    <div className="animate-fade-in">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hud-title text-glow text-2xl">ONTOLOGY</h1>
        <button onClick={toggleMarkers}
          className="px-2 py-0.5 rounded"
          style={{
            color: showMarkers ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: `1px solid ${showMarkers ? 'var(--color-primary)' : 'var(--color-border)'}`,
            background: showMarkers ? 'var(--color-hover-bg)' : 'transparent',
          }}>
          {'\u25b3\u25c6'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}>
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`hud-tab ${activeTab === tab.key ? 'hud-tab-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OntologyOverview showMarkers={showMarkers} />
      )}
      {activeTab === 'suggestions' && (
        <RelationSuggestions onChanged={() => {}} />
      )}
      {activeTab === 'metis' && (
        <MetisLinksTab />
      )}
    </div>
  )
}
