// SportModal — Erstellen/Bearbeiten von Sport-Einträgen
// Felder: Sportart, Dauer, Intensität (1-5), Notiz
// Wird vom Kalender aus geöffnet (Doppelklick oder Button)

import { useState, useEffect } from 'react'
import { useLanguage } from '../../hooks/useLanguage'
import useSportTypes from '../../hooks/useSportTypes'
import useMuscleGroups from '../../hooks/useMuscleGroups'
import { MUSCLE_GROUPS } from '../../types/sport'

export interface SportFormData {
  sport_type: string
  duration_min: number | null
  intensity: number | null
  muscle_groups: string[]
  note: string
}

interface Props {
  open: boolean
  date: string
  initial?: SportFormData & { id?: number }
  onSave: (data: SportFormData) => void
  onDelete?: () => void
  onClose: () => void
}

// Fallback wenn noch keine Historie vorhanden (leere DB)
const SPORT_FALLBACK = [
  'Gym', 'Laufen', 'Schwimmen', 'Radfahren', 'Yoga',
  'Wandern', 'Fussball', 'Basketball', 'Tennis', 'Klettern',
]

export default function SportModal({
  open, date, initial, onSave, onDelete, onClose,
}: Props) {
  const { t } = useLanguage()
  const [form, setForm] = useState<SportFormData>({
    sport_type: '', duration_min: null, intensity: null,
    muscle_groups: [], note: '',
  })

  // Sport-Typen aus Historie (haeufigster zuerst), Fallback bei leerer DB
  const { types } = useSportTypes()
  const typeChips = types.length > 0
    ? types.map((ti) => ti.type)
    : SPORT_FALLBACK

  // Muskelgruppen: feste Liste, aber nach Trainings-Haeufigkeit sortiert
  // (haeufig trainierte zuerst — analog zur Sport-Typen-Autocomplete).
  // Reihenfolge in MUSCLE_GROUPS dient als stabiler Tie-Breaker.
  const { groups: muscleFreq } = useMuscleGroups()
  const muscleChips = (() => {
    const freq = new Map(muscleFreq.map((m) => [m.group, m.count]))
    return [...MUSCLE_GROUPS].sort((a, b) => {
      const fb = (freq.get(b) || 0) - (freq.get(a) || 0)
      if (fb !== 0) return fb
      return MUSCLE_GROUPS.indexOf(a) - MUSCLE_GROUPS.indexOf(b)
    })
  })()

  // Formular befüllen bei Edit
  useEffect(() => {
    if (initial) {
      setForm({
        sport_type: initial.sport_type,
        duration_min: initial.duration_min,
        intensity: initial.intensity,
        muscle_groups: initial.muscle_groups || [],
        note: initial.note || '',
      })
    } else {
      setForm({
        sport_type: '', duration_min: null, intensity: null,
        muscle_groups: [], note: '',
      })
    }
  }, [initial, open])

  if (!open) return null

  const isEdit = !!initial?.id
  const canSave = form.sport_type.trim().length > 0

  // Muskelgruppe an-/abwählen (Multi-Select)
  const toggleMuscle = (g: string) => {
    setForm((f) => ({
      ...f,
      muscle_groups: f.muscle_groups.includes(g)
        ? f.muscle_groups.filter((x) => x !== g)
        : [...f.muscle_groups, g],
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="hud-card p-6 rounded-lg border w-96 animate-fade-in"
        style={{ borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="hud-title text-sm text-glow"
            style={{ color: 'var(--color-primary)' }}>
            {isEdit
              ? (t.sport?.editTitle || 'Training bearbeiten')
              : (t.sport?.newTitle || 'Neues Training')}
          </h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {date}
          </span>
        </div>

        {/* Sportart — Presets + Freitext */}
        <div className="mb-3">
          <label className="text-xs mb-1 block"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.sport?.typeLabel || 'Sportart'}
          </label>
          <div className="flex flex-wrap gap-1 mb-2">
            {typeChips.map((s) => (
              <button key={s}
                className="text-xs px-2 py-1 rounded-md border transition-all"
                style={{
                  borderColor: form.sport_type === s
                    ? 'var(--color-primary)' : 'var(--color-border)',
                  color: form.sport_type === s
                    ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  background: form.sport_type === s
                    ? 'var(--color-active-bg)' : 'transparent',
                }}
                onClick={() => setForm({ ...form, sport_type: s })}>
                {s}
              </button>
            ))}
          </div>
          <input className="hud-input w-full text-xs"
            placeholder={t.sport?.typePlaceholder || 'Oder eigene Sportart...'}
            value={form.sport_type}
            onChange={(e) => setForm({ ...form, sport_type: e.target.value })} />
        </div>

        {/* Dauer */}
        <div className="mb-3">
          <label className="text-xs mb-1 block"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.sport?.durationLabel || 'Dauer (Minuten)'}
          </label>
          <input className="hud-input w-full text-xs" type="number" min={1}
            placeholder="60"
            value={form.duration_min ?? ''}
            onChange={(e) => setForm({
              ...form,
              duration_min: e.target.value ? parseInt(e.target.value) : null,
            })} />
        </div>

        {/* Intensität 1-5 */}
        <div className="mb-3">
          <label className="text-xs mb-1 block"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.sport?.intensityLabel || 'Intensität'}
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button key={lvl}
                className="w-8 h-8 rounded-md border text-xs font-medium transition-all"
                style={{
                  borderColor: form.intensity === lvl
                    ? 'var(--color-primary)' : 'var(--color-border)',
                  color: form.intensity === lvl
                    ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  background: form.intensity === lvl
                    ? 'var(--color-active-bg)' : 'transparent',
                }}
                onClick={() => setForm({ ...form, intensity: lvl })}>
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Muskelgruppen — Multi-Select, optional */}
        <div className="mb-3">
          <label className="text-xs mb-1 block"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.sport?.muscleLabel || 'Muskelgruppen (optional)'}
          </label>
          <div className="flex flex-wrap gap-1">
            {muscleChips.map((g) => {
              const active = form.muscle_groups.includes(g)
              return (
                <button key={g}
                  className="text-xs px-2 py-1 rounded-md border transition-all"
                  style={{
                    borderColor: active
                      ? 'var(--color-primary)' : 'var(--color-border)',
                    color: active
                      ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    background: active
                      ? 'var(--color-active-bg)' : 'transparent',
                  }}
                  onClick={() => toggleMuscle(g)}>
                  {t.sport?.muscleGroups?.[g] || g}
                </button>
              )
            })}
          </div>
        </div>

        {/* Notiz */}
        <div className="mb-4">
          <label className="text-xs mb-1 block"
            style={{ color: 'var(--color-text-muted)' }}>
            {t.sport?.noteLabel || 'Notiz (optional)'}
          </label>
          <textarea className="hud-input w-full text-xs" rows={2}
            placeholder={t.sport?.notePlaceholder || 'Besonderheiten, Verletzungen...'}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button className="hud-btn hud-btn-primary flex-1 text-xs"
            disabled={!canSave}
            onClick={() => onSave(form)}>
            {isEdit
              ? (t.sport?.save || 'Speichern')
              : (t.sport?.create || 'Erstellen')}
          </button>
          {isEdit && onDelete && (
            <button className="hud-btn hud-btn-danger text-xs px-3"
              onClick={onDelete}>
              X
            </button>
          )}
          <button className="hud-btn text-xs px-3" onClick={onClose}>
            {t.sport?.cancel || 'Abbrechen'}
          </button>
        </div>
      </div>
    </div>
  )
}
