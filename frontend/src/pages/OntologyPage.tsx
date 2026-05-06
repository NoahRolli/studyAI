// OntologyPage — Wissensgraph aller typisierten Relationen
// Tabs: Uebersicht, Inbox, Graph
// Lazy-Mount + Keep-Alive: Tabs laden beim ersten Besuch, bleiben dann im DOM

import PageProviderBadge from "../components/PageProviderBadge"
import { useState, useCallback, useRef } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import OntologyOverview from '../components/relations/OntologyOverview'
import OntologyInbox from '../components/relations/OntologyInbox'
import OntologyEgoGraph from '../components/relations/OntologyEgoGraph'
import { getMarkersVisible, setMarkersVisible } from '../utils/ontologyMarkers'

type Tab = 'overview' | 'inbox' | 'graph'

export default function OntologyPage() {
  const { language } = useLanguage()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showMarkers, setShowMarkers] = useState(getMarkersVisible)
  const [graphFocus, setGraphFocus] = useState<string | null>(null)
  // Visited-Set: trackt welche Tabs schon einmal besucht wurden
  const visited = useRef<Set<Tab>>(new Set<Tab>(['overview']))

  const switchTab = (tab: Tab) => {
    visited.current.add(tab)
    setActiveTab(tab)
  }

  const toggleMarkers = useCallback(() => {
    setShowMarkers(prev => {
      setMarkersVisible(!prev)
      return !prev
    })
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: language === 'de' ? 'Übersicht' : 'Overview' },
    { key: 'inbox', label: language === 'de' ? 'Inbox' : 'Inbox' },
    { key: 'graph', label: 'Graph' },
  ]

  // Wrapper: rendert Inhalt nur wenn Tab schon besucht, versteckt wenn nicht aktiv
  const pane = (tab: Tab, children: React.ReactNode) => {
    if (!visited.current.has(tab)) return null
    return <div className={activeTab === tab ? '' : 'hidden'}>{children}</div>
  }

  return (
    <div className="animate-fade-in">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="hud-title text-glow text-2xl">ONTOLOGY</h1>
          <PageProviderBadge page="ontology" />
        </div>
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
            onClick={() => switchTab(tab.key)}
            className={`hud-tab ${activeTab === tab.key ? 'hud-tab-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content — Lazy-Mount + Keep-Alive */}
      {pane('overview',
        <OntologyOverview showMarkers={showMarkers}
          onNodeFocus={(key) => { setGraphFocus(key); switchTab('graph') }} />
      )}
      {pane('inbox', <OntologyInbox />)}
      {pane('graph',
        <OntologyEgoGraph focusKey={graphFocus} onFocusChange={setGraphFocus} />
      )}
    </div>
  )
}
