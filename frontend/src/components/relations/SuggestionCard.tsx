// SuggestionCard — Einzelne Relation-Suggestion mit Aktionen
// Confirm, Reject, Edit Buttons + Reason-Anzeige

import { useLanguage } from '../../hooks/useLanguage'
import type { RelationData } from '../../types/relations'

interface Props {
  suggestion: RelationData
  onConfirm: (id: number) => void
  onReject: (id: number) => void
  onEdit: (s: RelationData) => void
}

export default function SuggestionCard({
  suggestion: s, onConfirm, onReject, onEdit,
}: Props) {
  const { language } = useLanguage()

  const typeLabel = (rt: RelationData['relation_type']) =>
    rt ? (language === 'de' ? rt.label_de : rt.label_en) : '?'

  return (
    <div className="p-3 rounded-lg border"
      style={{
        background: 'var(--color-bg-surface)',
        borderColor: 'rgba(255, 170, 0, 0.2)',
      }}>
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span style={{ color: 'var(--color-text-primary)' }}>
          {s.source_title || `#${s.source_id}`}
        </span>
        <span className="font-semibold px-2 py-0.5 rounded text-xs"
          style={{ color: 'var(--color-warning)', background: 'rgba(255, 170, 0, 0.1)' }}>
          {typeLabel(s.relation_type)}
        </span>
        <span style={{ color: 'var(--color-text-primary)' }}>
          {s.target_title || `#${s.target_id}`}
        </span>
      </div>
      {s.reason && (
        <p className="text-xs mt-1.5"
          style={{ color: 'var(--color-text-secondary)' }}>
          {s.reason}
        </p>
      )}
      <div className="flex gap-2 mt-2">
        <button onClick={() => onEdit(s)}
          className="hud-btn text-xs px-2 py-0.5"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
          {language === 'de' ? 'Bearbeiten' : 'Edit'}
        </button>
        <button onClick={() => onConfirm(s.id)}
          className="hud-btn text-xs px-2 py-0.5"
          style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)' }}>
          {language === 'de' ? 'Bestätigen' : 'Confirm'}
        </button>
        <button onClick={() => onReject(s.id)}
          className="hud-btn text-xs px-2 py-0.5"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
          {language === 'de' ? 'Ablehnen' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
