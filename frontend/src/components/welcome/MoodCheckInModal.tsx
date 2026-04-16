// MoodCheckInModal — Stimmung + Koerperempfinden Check-In
// Tab-System: Stimmung | Koerper — beide speichern in denselben Record
// Labels via i18n, Score wird automatisch berechnet
// 2h Cooldown via localStorage, sanft wegklickbar

import { useState, useEffect } from 'react'
import { post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'
import {
  Cluster, POSITIVE_CLUSTERS, NEGATIVE_CLUSTERS,
  BODY_POSITIVE_CLUSTERS, BODY_NEGATIVE_CLUSTERS,
} from './MoodClusterData'

const COOLDOWN_KEY = 'pallas-mood-checkin-last'
const COOLDOWN_MS = 2 * 60 * 60 * 1000
const DISMISS_KEY = 'pallas-mood-dismiss-count'
const MAX_DISMISS_PER_DAY = 3

type Tab = 'mood' | 'body'

export default function MoodCheckInModal() {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<Tab>('mood')
  const [selectedMoods, setSelectedMoods] = useState<Set<string>>(new Set())
  const [selectedBody, setSelectedBody] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Pruefen ob Modal gezeigt werden soll
  useEffect(() => {
    const lastStr = localStorage.getItem(COOLDOWN_KEY)
    if (lastStr) {
      const elapsed = Date.now() - parseInt(lastStr, 10)
      if (elapsed < COOLDOWN_MS) return
    }
    const dismissData = localStorage.getItem(DISMISS_KEY)
    if (dismissData) {
      const { date, count } = JSON.parse(dismissData)
      const today = new Date().toISOString().slice(0, 10)
      if (date === today && count >= MAX_DISMISS_PER_DAY) return
    }
    const timer = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    const today = new Date().toISOString().slice(0, 10)
    const dismissData = localStorage.getItem(DISMISS_KEY)
    let count = 1
    if (dismissData) {
      const parsed = JSON.parse(dismissData)
      if (parsed.date === today) count = parsed.count + 1
    }
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ date: today, count }))
  }

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFn(next)
  }

  const handleSave = async () => {
    if (selectedMoods.size === 0 && selectedBody.size === 0) return
    setSaving(true)
    try {
      await post('/api/journal/mood-checkins', {
        moods: Array.from(selectedMoods),
        body_moods: Array.from(selectedBody).length > 0
          ? Array.from(selectedBody) : null,
        note: note.trim() || null,
      })
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
      setSaved(true)
      setTimeout(() => setVisible(false), 1500)
    } catch (err) {
      console.error('Check-In fehlgeschlagen:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!visible) return null

  const totalCount = selectedMoods.size + selectedBody.size

  // Mood-Button — polarity bestimmt Farbe bei Auswahl
  const moodBtn = (
    mood: string, polarity: 'positive' | 'negative', isBody: boolean,
  ) => {
    const set = isBody ? selectedBody : selectedMoods
    const setFn = isBody ? setSelectedBody : setSelectedMoods
    const isOn = set.has(mood)
    const onColor = polarity === 'positive' ? 'var(--color-success)' : 'var(--color-danger)'
    const onBg = polarity === 'positive' ? 'rgba(0, 200, 100, 0.15)' : 'rgba(255, 80, 80, 0.15)'
    // Body-Moods nutzen bodyMoods-Lookup, Stimmungs-Moods nutzen moods-Lookup
    const labels = isBody ? t.moodCheckIn.bodyMoods : t.moodCheckIn.moods
    const label = (labels as Record<string, string>)[mood] || mood
    return (
      <button key={mood} onClick={() => toggle(set, setFn, mood)}
        className="text-xs px-2 py-1 rounded border transition-all"
        style={{
          borderColor: isOn ? onColor : 'var(--color-border)',
          background: isOn ? onBg : 'transparent',
          color: isOn ? onColor : 'var(--color-text-secondary)',
          fontSize: '0.7rem',
        }}>
        {label}
      </button>
    )
  }

  // Cluster-Block — Header + Buttons
  const renderCluster = (cluster: Cluster, polarity: 'positive' | 'negative', isBody: boolean) => (
    <div key={`${cluster.key}-${polarity}`} className="mb-2">
      <p className="mb-1" style={{
        color: 'var(--color-text-muted)', fontSize: '0.6rem',
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {t.moodCheckIn.clusters[cluster.key as keyof typeof t.moodCheckIn.clusters]}
      </p>
      <div className="flex flex-wrap gap-1">
        {cluster.moods.map(m => moodBtn(m, polarity, isBody))}
      </div>
    </div>
  )

  // Zwei-Spalten Grid fuer positive/negative Cluster
  const renderGrid = (pos: Cluster[], neg: Cluster[], isBody: boolean) => (
    <div className="overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
      <div>
        <p className="mb-2 font-medium" style={{
          color: 'var(--color-success)', fontSize: '0.7rem',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{t.moodCheckIn.positive}</p>
        {pos.map(c => renderCluster(c, 'positive', isBody))}
      </div>
      <div>
        <p className="mb-2 font-medium" style={{
          color: 'var(--color-danger)', fontSize: '0.7rem',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{t.moodCheckIn.negative}</p>
        {neg.map(c => renderCluster(c, 'negative', isBody))}
      </div>
    </div>
  )

  // Tab-Button Style
  const tabStyle = (t: Tab) => ({
    color: tab === t ? 'var(--color-accent)' : 'var(--color-text-muted)',
    borderBottom: tab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
  })

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-lg border w-full max-w-2xl animate-fade-in flex flex-col"
        style={{
          background: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-glow)',
          boxShadow: '0 0 30px rgba(0, 212, 255, 0.1)',
          maxHeight: '90vh',
        }}>
        {saved ? (
          <div className="text-center py-8 px-5">
            <p className="text-lg" style={{ color: 'var(--color-success)' }}>
              {t.moodCheckIn.saved}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="hud-title text-glow text-sm">{t.moodCheckIn.title}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t.moodCheckIn.subtitle}
                </p>
              </div>
              <button onClick={handleDismiss}
                className="text-xs px-2 py-1 flex-shrink-0 ml-2"
                style={{ color: 'var(--color-text-muted)' }}>
                {t.moodCheckIn.dismiss}
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 px-4 pt-3 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => setTab('mood')} className="pb-2 text-xs font-medium"
                style={tabStyle('mood')}>
                {t.moodCheckIn.tabMood}
                {selectedMoods.size > 0 && ` (${selectedMoods.size})`}
              </button>
              <button onClick={() => setTab('body')} className="pb-2 text-xs font-medium"
                style={tabStyle('body')}>
                {t.moodCheckIn.tabBody}
                {selectedBody.size > 0 && ` (${selectedBody.size})`}
              </button>
            </div>

            {/* Tab-Inhalt */}
            {tab === 'mood'
              ? renderGrid(POSITIVE_CLUSTERS, NEGATIVE_CLUSTERS, false)
              : renderGrid(BODY_POSITIVE_CLUSTERS, BODY_NEGATIVE_CLUSTERS, true)
            }

            {/* Footer: Notiz + Speichern */}
            <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <input type="text" value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.moodCheckIn.notePlaceholder}
                maxLength={200}
                className="w-full text-xs px-3 py-2 rounded border mb-3"
                style={{
                  background: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }} />
              <button onClick={handleSave}
                disabled={totalCount === 0 || saving}
                className="hud-btn text-sm w-full">
                {saving ? t.moodCheckIn.saving : t.moodCheckIn.save}
                {totalCount > 0 && !saving && ` (${totalCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
