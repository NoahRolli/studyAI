// OntologyPage — Wissensgraph aller typisierten Relationen
import PageProviderBadge from "../components/PageProviderBadge"// Tabs: Übersicht, Vorschläge, Metis Links, Graph (Ego-View)
// Ontologie-Symbole togglebar via localStorage

import { useState, useCallback } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import RelationSuggestions from '../components/relations/RelationSuggestions'
import MetisLinksTab from '../components/metis/MetisLinksTab'
import UnlinkedMentions from '../components/relations/UnlinkedMentions'
import StructuralGaps from '../components/relations/StructuralGaps'
import MergeSuggestions from '../components/relations/MergeSuggestions'
import OntologyOverview from '../components/relations/OntologyOverview'
import OntologyEgoGraph from '../components/relations/OntologyEgoGraph'
import { getMarkersVisible, setMarkersVisible } from '../utils/ontologyMarkers'

export default function OntologyPage() {
  const { language } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'suggestions' | 'mentions' | 'gaps' | 'merge' | 'metis' | 'graph'>('overview')
  const [showMarkers, setShowMarkers] = useState(getMarkersVisible)
  const [graphFocus, setGraphFocus] = useState<string | null>(null)

  const toggleMarkers = useCallback(() => {
    setShowMarkers(prev => {
      setMarkersVisible(!prev)
      return !prev
    })
  }, [])

  const tabs = [
    { key: 'overview' as const, label: language === 'de' ? 'Übersicht' : 'Overview' },
    { key: 'suggestions' as const, label: language === 'de' ? 'Vorschläge' : 'Suggestions' },
    { key: 'mentions' as const, label: language === 'de' ? 'Erwähnungen' : 'Mentions' },
    { key: 'gaps' as const, label: language === 'de' ? 'Lücken' : 'Gaps' },
    { key: 'merge' as const, label: 'Merge' },
    { key: 'metis' as const, label: 'Metis Links' },
    { key: 'graph' as const, label: 'Graph' },
  ]

  // Doppelklick auf Node-Titel → Graph-Tab mit Fokus

  return (
    <div className="animate-fade-in">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3"><h1 className="hud-title text-glow text-2xl">ONTOLOGY</h1><PageProviderBadge page="ontology" /></div>
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
        <OntologyOverview showMarkers={showMarkers} onNodeFocus={(key) => { setGraphFocus(key); setActiveTab("graph") }} />
      )}
      {activeTab === 'suggestions' && (
        <RelationSuggestions onChanged={() => {}} />
      )}
      {activeTab === 'mentions' && (
        <UnlinkedMentions />
      )}
      {activeTab === 'gaps' && (
        <StructuralGaps />
      )}
      {activeTab === 'merge' && (
        <MergeSuggestions />
      )}
      {activeTab === 'metis' && (
        <MetisLinksTab />
      )}
      {activeTab === 'graph' && (
        <OntologyEgoGraph
          focusKey={graphFocus}
          onFocusChange={setGraphFocus} />
      )}
    </div>
  )
}
