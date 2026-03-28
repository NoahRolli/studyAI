// ThemeSelector — Dropdown zum Wechseln des Designs
// Wird in der Sidebar angezeigt, neben dem LanguageToggle
// Liest verfügbare Themes aus THEMES Konstante

import { useTheme, THEMES } from '../hooks/useTheme'
import type { ThemeKey } from '../hooks/useTheme'

function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemeKey)}
      className="hud-input text-xs py-1 px-2 w-fit cursor-pointer"
      style={{
        fontFamily: "'Orbitron', monospace",
        fontSize: '0.65rem',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {Object.entries(THEMES).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}

export default ThemeSelector