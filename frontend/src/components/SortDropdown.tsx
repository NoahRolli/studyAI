// SortDropdown — HUD-styled Select fuer Sort-Modi
// Wird gemeinsam mit useDocumentSort genutzt
//
// Props:
//   mode: aktueller SortMode
//   onChange: Setter (kommt von useDocumentSort)
//   showType: ob Typ-Sort verfuegbar (nur bei Documents)

import type { SortMode } from '../hooks/useDocumentSort'
import { useLanguage } from '../hooks/useLanguage'

interface Props {
  mode: SortMode
  onChange: (m: SortMode) => void
  showType?: boolean
  showManual?: boolean
}

export default function SortDropdown({ mode, onChange, showType = false, showManual = false }: Props) {
  const { t } = useLanguage()
  const labels = t.sortDropdown

  return (
    <select
      value={mode}
      onChange={(e) => onChange(e.target.value as SortMode)}
      className="hud-input"
      style={{ minWidth: '140px', fontSize: '13px' }}
      aria-label={labels.ariaLabel}
    >
      {showManual && <option value="manual">{labels.manual}</option>}
      <option value="date-desc">{labels.dateDesc}</option>
      <option value="date-asc">{labels.dateAsc}</option>
      <option value="name-asc">{labels.nameAsc}</option>
      <option value="name-desc">{labels.nameDesc}</option>
      {showType && <option value="type-asc">{labels.typeAsc}</option>}
    </select>
  )
}
