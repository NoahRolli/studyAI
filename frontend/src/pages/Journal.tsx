// Journal — Orchestrator für das verschlüsselte Tagebuch
// Delegiert alles an Sub-Komponenten und useJournalState Hook
// Drei Zustände: Setup → Unlock → Tabs (Einträge, Kalender, Analytics, Meds)

import useJournalState from '../hooks/useJournalState'
import type { JournalTab } from '../hooks/useJournalState'
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

function Journal() {
  const s = useJournalState()

  // Auto-Lock bei Navigation weg oder Laptop-Zuklappen
  useJournalLock({
    isUnlocked: s.status?.is_unlocked ?? false,
    onLocked: s.resetState,
    lockOnNavigateAway: true,
    lockOnVisibilityChange: true,
  })

  // Loading-Zustand
  if (s.loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="hud-title text-glow text-2xl mb-6">Journal</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Systeme werden initialisiert...
        </p>
      </div>
    )
  }

  // Tab-Konfiguration (Medikamente nur wenn aktiviert)
  const tabs: { key: JournalTab; label: string }[] = [
    { key: 'entries', label: 'Einträge' },
    { key: 'calendar', label: 'Kalender' },
    { key: 'mood', label: 'Stimmung' },
    { key: 'clusters', label: 'Themen' },
    { key: 'storylines', label: 'Storylines' },
    ...(s.medEnabled
      ? [{ key: 'medications' as JournalTab, label: 'Medikamente' }]
      : []),
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="hud-title text-glow text-2xl">Journal</h1>
        {s.status?.is_unlocked && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.medEnabled}
                onChange={s.toggleMedTracker}
                className="w-4 h-4 rounded accent-[var(--color-primary)]"
              />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Medikamenten-Tracking
              </span>
            </label>
            <button onClick={s.lockJournal} className="hud-btn hud-btn-danger">
              Sperren
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
                {s.showForm ? 'Abbrechen' : '+ Neuer Eintrag'}
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