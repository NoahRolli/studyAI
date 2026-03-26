// Journal — Orchestrator für das verschlüsselte Tagebuch
// Delegiert alles an Sub-Komponenten und useJournalState Hook
// Drei Zustände: Setup → Unlock → Tabs (Einträge, Kalender, Analytics, Meds)
// Globale Suche im Header über alle Einträge

import { useRef } from 'react'
import useJournalState from '../hooks/useJournalState'
import type { JournalTab } from '../hooks/useJournalState'
import type { JournalEntry } from '../types/models'
import { useLanguage } from '../hooks/useLanguage'
import useJournalLock from '../hooks/useJournalLock'
import JournalSetup from '../components/journal/JournalSetup'
import JournalUnlock from '../components/journal/JournalUnlock'
import EntryForm from '../components/journal/EntryForm'
import EntryList from '../components/journal/EntryList'
import CalendarView from '../components/journal/CalendarView'
import MoodChart from '../components/journal/MoodChart'
import ClusterView from '../components/journal/ClusterView'
import StorylineView from '../components/journal/StorylineView'
import MedicationTracker from '../components/journal/MedicationTracker'
import JournalSearch from '../components/journal/JournalSearch'

function Journal() {
  const s = useJournalState()
  const { t } = useLanguage()

  // Ref um CalendarView von aussen zu steuern (Tag öffnen)
  const calendarRef = useRef<{ openDay: (date: string) => void }>(null)

  // Auto-Lock bei Navigation weg oder Laptop-Zuklappen
  useJournalLock({
    isUnlocked: s.status?.is_unlocked ?? false,
    onLocked: s.resetState,
    lockOnNavigateAway: true,
    lockOnVisibilityChange: true,
  })

  // Suche: Treffer angeklickt → Kalender-Tab + Modal für den Tag
  function handleSearchSelect(entry: JournalEntry) {
    s.setActiveTab('calendar')
    setTimeout(() => {
      calendarRef.current?.openDay(entry.date)
    }, 100)
  }

  // Loading-Zustand
  if (s.loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="hud-title text-glow text-2xl mb-6">{t.journal.title}</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {t.journal.systemInit}
        </p>
      </div>
    )
  }

  // Tab-Konfiguration (Medikamente nur wenn aktiviert)
  const tabs: { key: JournalTab; label: string }[] = [
    { key: 'entries', label: t.journal.tabs.entries },
    { key: 'calendar', label: t.journal.tabs.calendar },
    { key: 'mood', label: t.journal.tabs.mood },
    { key: 'clusters', label: t.journal.tabs.clusters },
    { key: 'storylines', label: t.journal.tabs.storylines },
    ...(s.medEnabled
      ? [{ key: 'medications' as JournalTab, label: t.journal.tabs.medications }]
      : []),
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="hud-title text-glow text-2xl">{t.journal.title}</h1>
        {s.status?.is_unlocked && (
          <div className="flex items-center gap-4">
            <JournalSearch
              entries={s.entries}
              onSelectEntry={handleSearchSelect}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.medEnabled}
                onChange={s.toggleMedTracker}
                className="w-4 h-4 rounded accent-[var(--color-primary)]"
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t.journal.medTracking}
              </span>
            </label>
            <button onClick={s.lockJournal} className="hud-btn hud-btn-danger">
              {t.journal.lock}
            </button>
          </div>
        )}
      </div>

      {/* Fehler + Erfolg */}
      {s.error && (
        <div
          className="px-4 py-3 rounded-lg mb-6 border"
          style={{
            background: 'rgba(255, 59, 92, 0.1)',
            borderColor: 'rgba(255, 59, 92, 0.3)',
            color: 'var(--color-danger)',
          }}
        >
          {s.error}
        </div>
      )}
      {s.message && (
        <div
          className="px-4 py-3 rounded-lg mb-6 border"
          style={{
            background: 'rgba(0, 255, 136, 0.1)',
            borderColor: 'rgba(0, 255, 136, 0.3)',
            color: 'var(--color-success)',
          }}
        >
          {s.message}
        </div>
      )}

      {/* Zustand 1: Setup */}
      {s.status && !s.status.is_setup && (
        <JournalSetup
          password={s.password}
          onPasswordChange={s.setPassword}
          onSetup={s.setupJournal}
        />
      )}

      {/* Zustand 2: Unlock */}
      {s.status && s.status.is_setup && !s.status.is_unlocked && (
        <JournalUnlock
          password={s.password}
          onPasswordChange={s.setPassword}
          onUnlock={s.unlockJournal}
        />
      )}

      {/* Zustand 3: Entsperrt → Tabs */}
      {s.status?.is_unlocked && (
        <div>
          {/* Tab-Navigation */}
          <div
            className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
            style={{ backgroundColor: 'var(--color-bg-surface)' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  s.setActiveTab(tab.key)
                  if (tab.key === 'mood') s.loadMoods()
                }}
                className={`hud-tab ${s.activeTab === tab.key ? 'hud-tab-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Einträge */}
          {s.activeTab === 'entries' && (
            <div>
              <button
                onClick={() => s.setShowForm(!s.showForm)}
                className="hud-btn mb-6"
              >
                {s.showForm ? t.common.cancel : t.common.newEntry}
              </button>
              {s.showForm && (
                <EntryForm
                  autoTitle={s.autoTitle}
                  onAutoTitleChange={s.setAutoTitle}
                  onSave={s.createEntry}
                  onCancel={() => s.setShowForm(false)}
                />
              )}
              <EntryList
                entries={s.entries}
                editingId={s.editingId}
                editEntry={s.editEntry}
                onStartEdit={s.startEdit}
                onSaveEdit={s.saveEdit}
                onCancelEdit={s.cancelEdit}
                onDelete={s.deleteEntry}
              />
            </div>
          )}

          {/* Tab: Kalender */}
          {s.activeTab === 'calendar' && (
            <CalendarView
              ref={calendarRef}
              moods={s.moods}
              moodsLoaded={s.moodsLoaded}
              onLoadMoods={s.loadMoods}
              entries={s.entries}
              editingId={s.editingId}
              editEntry={s.editEntry}
              onStartEdit={s.startEdit}
              onSaveEdit={s.saveEdit}
              onCancelEdit={s.cancelEdit}
              onDelete={s.deleteEntry}
              onCreateEntry={s.createEntry}
              autoTitle={s.autoTitle}
              onAutoTitleChange={s.setAutoTitle}
              medEnabled={s.medEnabled}
            />
          )}

          {/* Tab: Stimmung */}
          {s.activeTab === 'mood' && (
            <MoodChart
              entries={s.entries}
              moods={s.moods}
              loading={!s.moodsLoaded && s.moods.length === 0}
            />
          )}

          {/* Tab: Themen */}
          {s.activeTab === 'clusters' && <ClusterView />}

          {/* Tab: Storylines */}
          {s.activeTab === 'storylines' && <StorylineView />}

          {/* Tab: Medikamente */}
          {s.activeTab === 'medications' && s.medEnabled && (
            <MedicationTracker
              medications={s.medications}
              onReload={s.loadMedications}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default Journal