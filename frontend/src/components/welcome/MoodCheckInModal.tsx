// MoodCheckInModal — Stimmungserfassung auf der Welcome-Page
// 24 Mood-Kategorien in 7 Clustern (Energie/Ruhe/Kognitiv/Emotion/Antrieb/Sozial/Stress)
// Labels via i18n, Score wird automatisch berechnet
// 2h Cooldown via localStorage, sanft wegklickbar

import { useState, useEffect } from 'react'
import { post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

const COOLDOWN_KEY = 'pallas-mood-checkin-last'
const COOLDOWN_MS = 2 * 60 * 60 * 1000
const DISMISS_KEY = 'pallas-mood-dismiss-count'
const MAX_DISMISS_PER_DAY = 3

// Cluster-Definition: cluster-key + zugehoerige Mood-Keys
// Reihenfolge bestimmt Anzeige-Reihenfolge im Modal
type Cluster = { key: string; moods: string[] }

const POSITIVE_CLUSTERS: Cluster[] = [
  { key: 'energy', moods: ['energized', 'refreshed'] },
  { key: 'calm', moods: ['calm', 'grounded'] },
  { key: 'emotion', moods: ['happy', 'grateful', 'proud'] },
  { key: 'drive', moods: ['focused', 'motivated', 'creative'] },
  { key: 'social', moods: ['social', 'connected'] },
]

const NEGATIVE_CLUSTERS: Cluster[] = [
  { key: 'energy', moods: ['tired', 'exhausted', 'restless'] },
  { key: 'stress', moods: ['stressed', 'anxious', 'overwhelmed'] },
  { key: 'emotion', moods: ['sad', 'irritated', 'angry', 'lonely'] },
  { key: 'cognitive', moods: ['unfocused', 'foggy'] },
]

export default function MoodCheckInModal() {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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

  const toggleMood = (mood: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(mood)) next.delete(mood)
      else next.add(mood)
      return next
    })
  }

  const handleSave = async () => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      await post('/api/journal/mood-checkins', {
        moods: Array.from(selected),
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

  // Mood-Button — Render-Helper, polarity bestimmt Farbe bei Auswahl
  const moodButton = (mood: string, polarity: 'positive' | 'negative') => {
    const isOn = selected.has(mood)
    const onColor = polarity === 'positive' ? 'var(--color-success)' : 'var(--color-danger)'
    const onBg = polarity === 'positive' ? 'rgba(0, 200, 100, 0.15)' : 'rgba(255, 80, 80, 0.15)'
    return (
      <button key={mood} onClick={() => toggleMood(mood)}
        className="text-xs px-2 py-1 rounded border transition-all"
        style={{
          borderColor: isOn ? onColor : 'var(--color-border)',
          background: isOn ? onBg : 'transparent',
          color: isOn ? onColor : 'var(--color-text-secondary)',
          fontSize: '0.7rem',
        }}>
        {t.moodCheckIn.moods[mood as keyof typeof t.moodCheckIn.moods] || mood}
      </button>
    )
  }

  // Cluster-Block — Header + Buttons
  const renderCluster = (cluster: Cluster, polarity: 'positive' | 'negative') => (
    <div key={cluster.key} className="mb-2">
      <p className="mb-1" style={{
        color: 'var(--color-text-muted)',
        fontSize: '0.6rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        {t.moodCheckIn.clusters[cluster.key as keyof typeof t.moodCheckIn.clusters]}
      </p>
      <div className="flex flex-wrap gap-1">
        {cluster.moods.map(m => moodButton(m, polarity))}
      </div>
    </div>
  )

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
            {/* Header (sticky) */}
            <div className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="hud-title text-glow text-sm">
                  {t.moodCheckIn.title}
                </h3>
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

            {/* Scrollbarer Cluster-Bereich */}
            <div className="overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
              {/* Positive Spalte */}
              <div>
                <p className="mb-2 font-medium" style={{
                  color: 'var(--color-success)',
                  fontSize: '0.7rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  {t.moodCheckIn.positive}
                </p>
                {POSITIVE_CLUSTERS.map(c => renderCluster(c, 'positive'))}
              </div>

              {/* Negative Spalte */}
              <div>
                <p className="mb-2 font-medium" style={{
                  color: 'var(--color-danger)',
                  fontSize: '0.7rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  {t.moodCheckIn.negative}
                </p>
                {NEGATIVE_CLUSTERS.map(c => renderCluster(c, 'negative'))}
              </div>
            </div>

            {/* Footer (sticky): Notiz + Speichern */}
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
                disabled={selected.size === 0 || saving}
                className="hud-btn text-sm w-full">
                {saving ? t.moodCheckIn.saving : t.moodCheckIn.save}
                {selected.size > 0 && !saving && ` (${selected.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
