// OntologyInbox — Container fuer die drei Pflege-Workflows
// Pflege-Workflow: Erwaehnungen verknuepfen -> Duplikate mergen -> Beziehungen bestaetigen
// Pills oben, dann die jeweils aktive Sub-Component. Sub-Components laden ihre
// eigenen Daten beim Mount — wir laden hier nichts selbst (zwei der Endpoints
// sind teuer, daher kein Vor-Fetch fuer Counter-Badges).

import { useState } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import RelationSuggestions from './RelationSuggestions'
import UnlinkedMentions from './UnlinkedMentions'
import MergeSuggestions from './MergeSuggestions'

type View = 'mentions' | 'merge' | 'relations'

export default function OntologyInbox() {
  const { language } = useLanguage()
  const [view, setView] = useState<View>('mentions')

  const labels = {
    intro: language === 'de'
      ? 'Pflege deiner Wissensbasis. Empfohlene Reihenfolge:'
      : 'Maintain your knowledge base. Recommended order:',
    step1: language === 'de'
      ? '1. Erwaehnungen verknuepfen (Konzepte mit Notizen verbinden)'
      : '1. Link mentions (connect concepts to notes)',
    step2: language === 'de'
      ? '2. Duplikate zusammenfuehren (Konzept-Doppelungen aufraeumen)'
      : '2. Merge duplicates (clean up duplicate concepts)',
    step3: language === 'de'
      ? '3. Beziehungen bestaetigen (typisierte Relationen festlegen)'
      : '3. Confirm relations (set typed relationships)',
    pillMentions: language === 'de' ? 'Erwaehnungen' : 'Mentions',
    pillMerge: language === 'de' ? 'Duplikate' : 'Duplicates',
    pillRelations: language === 'de' ? 'Beziehungen' : 'Relations',
  }

  const pills: { key: View; label: string }[] = [
    { key: 'mentions', label: labels.pillMentions },
    { key: 'merge', label: labels.pillMerge },
    { key: 'relations', label: labels.pillRelations },
  ]

  return (
    <div>
      {/* Workflow-Beschreibung */}
      <div className="mb-6 p-4 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}>
        <div className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {labels.intro}
        </div>
        <ol className="text-sm space-y-1" style={{ color: 'var(--color-text)' }}>
          <li>{labels.step1}</li>
          <li>{labels.step2}</li>
          <li>{labels.step3}</li>
        </ol>
      </div>

      {/* Pills */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-surface)' }}>
        {pills.map(pill => (
          <button key={pill.key}
            onClick={() => setView(pill.key)}
            className={`hud-tab ${view === pill.key ? 'hud-tab-active' : ''}`}>
            {pill.label}
          </button>
        ))}
      </div>

      {/* Active Sub-Component — Lazy Mount + Keep-Alive Pattern */}
      <div className={view === 'mentions' ? '' : 'hidden'}>
        <UnlinkedMentions />
      </div>
      <div className={view === 'merge' ? '' : 'hidden'}>
        <MergeSuggestions />
      </div>
      <div className={view === 'relations' ? '' : 'hidden'}>
        <RelationSuggestions onChanged={() => {}} />
      </div>
    </div>
  )
}
