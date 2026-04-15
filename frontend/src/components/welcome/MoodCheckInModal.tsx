// MoodCheckInModal — Stimmungserfassung auf der Welcome-Page
// Kästchen fuer Mood-Kategorien, Score wird automatisch berechnet
// 2h Cooldown via localStorage, sanft wegklickbar

import { useState, useEffect } from 'react'
import { get, post } from '../../hooks/useAPI'
import { useLanguage } from '../../hooks/useLanguage'

const COOLDOWN_KEY = 'pallas-mood-checkin-last'
const COOLDOWN_MS = 2 * 60 * 60 * 1000
const DISMISS_KEY = 'pallas-mood-dismiss-count'
const MAX_DISMISS_PER_DAY = 3

// Labels fuer die Mood-Kategorien
const MOOD_LABELS: Record<string, { de: string; en: string }> = {
  energized: { de: 'Energiegeladen', en: 'Energized' },
  calm: { de: 'Ruhig', en: 'Calm' },
  focused: { de: 'Fokussiert', en: 'Focused' },
  happy: { de: 'Glücklich', en: 'Happy' },
  motivated: { de: 'Motiviert', en: 'Motivated' },
  creative: { de: 'Kreativ', en: 'Creative' },
  social: { de: 'Gesellig', en: 'Social' },
  tired: { de: 'Müde', en: 'Tired' },
  stressed: { de: 'Gestresst', en: 'Stressed' },
  anxious: { de: 'Ängstlich', en: 'Anxious' },
  sad: { de: 'Traurig', en: 'Sad' },
  irritated: { de: 'Gereizt', en: 'Irritated' },
  unfocused: { de: 'Unkonzentriert', en: 'Unfocused' },
  lonely: { de: 'Einsam', en: 'Lonely' },
}

const POSITIVE = ['energized', 'calm', 'focused', 'happy', 'motivated', 'creative', 'social']
const NEGATIVE = ['tired', 'stressed', 'anxious', 'sad', 'irritated', 'unfocused', 'lonely']

export default function MoodCheckInModal() {
  const { language } = useLanguage()
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
    // Dismiss-Zaehler pruefen
    const dismissData = localStorage.getItem(DISMISS_KEY)
    if (dismissData) {
      const { date, count } = JSON.parse(dismissData)
      const today = new Date().toISOString().slice(0, 10)
      if (date === today && count >= MAX_DISMISS_PER_DAY) return
    }
    // Kurze Verzoegerung damit Welcome-Animation fertig ist
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

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-lg border p-5 w-full max-w-md mx-4 animate-fade-in"
        style={{
          background: 'var(--color-bg-elevated)',
          borderColor: 'var(--color-border-glow)',
          boxShadow: '0 0 30px rgba(0, 212, 255, 0.1)',
        }}>
        {saved ? (
          <div className="text-center py-6">
            <p className="text-lg" style={{ color: 'var(--color-success)' }}>
              {language === 'de' ? 'Gespeichert' : 'Saved'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="hud-title text-glow text-sm">
                {language === 'de' ? 'WIE GEHT ES DIR?' : 'HOW ARE YOU?'}
              </h3>
              <button onClick={handleDismiss}
                className="text-xs px-2 py-1"
                style={{ color: 'var(--color-text-muted)' }}>
                {language === 'de' ? 'Nicht jetzt' : 'Not now'}
              </button>
            </div>

            {/* Positive Moods */}
            <div className="mb-3">
              <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {language === 'de' ? 'Positiv' : 'Positive'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {POSITIVE.map(m => (
                  <button key={m} onClick={() => toggleMood(m)}
                    className="text-xs px-2.5 py-1 rounded border transition-all"
                    style={{
                      borderColor: selected.has(m) ? 'var(--color-success)' : 'var(--color-border)',
                      background: selected.has(m) ? 'rgba(0, 200, 100, 0.15)' : 'transparent',
                      color: selected.has(m) ? 'var(--color-success)' : 'var(--color-text-secondary)',
                    }}>
                    {MOOD_LABELS[m]?.[language] || m}
                  </button>
                ))}
              </div>
            </div>

            {/* Negative Moods */}
            <div className="mb-4">
              <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {language === 'de' ? 'Negativ' : 'Negative'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {NEGATIVE.map(m => (
                  <button key={m} onClick={() => toggleMood(m)}
                    className="text-xs px-2.5 py-1 rounded border transition-all"
                    style={{
                      borderColor: selected.has(m) ? 'var(--color-danger)' : 'var(--color-border)',
                      background: selected.has(m) ? 'rgba(255, 80, 80, 0.15)' : 'transparent',
                      color: selected.has(m) ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                    }}>
                    {MOOD_LABELS[m]?.[language] || m}
                  </button>
                ))}
              </div>
            </div>

            {/* Optionaler Kommentar */}
            <input type="text" value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={language === 'de' ? 'Kurzer Kommentar (optional)' : 'Short comment (optional)'}
              maxLength={200}
              className="w-full text-xs px-3 py-2 rounded border mb-3"
              style={{
                background: 'var(--color-bg-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }} />

            {/* Speichern */}
            <button onClick={handleSave}
              disabled={selected.size === 0 || saving}
              className="hud-btn text-sm w-full">
              {saving
                ? (language === 'de' ? 'Speichern...' : 'Saving...')
                : (language === 'de' ? 'Speichern' : 'Save')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
