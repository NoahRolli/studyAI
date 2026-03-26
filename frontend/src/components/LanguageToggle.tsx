// LanguageToggle — DE/EN Umschalter für die Sidebar
// Zeigt aktive Sprache als Cyan-Highlight, inaktive gedimmt
// HUD-Design passend zum restlichen UI

import { useLanguage } from '../hooks/useLanguage'
import type { Language } from '../i18n'

// Verfügbare Sprachen mit Label
const LANGUAGES: { key: Language; label: string }[] = [
  { key: 'de', label: 'DE' },
  { key: 'en', label: 'EN' },
]

function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  return (
    <div
      className="flex gap-1 p-1 rounded-lg"
      style={{ backgroundColor: 'var(--color-bg-surface)' }}
    >
      {LANGUAGES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setLanguage(key)}
          className="px-2.5 py-1 rounded-md text-xs tracking-wide transition-all duration-300"
          style={{
            color: language === key
              ? 'var(--color-primary)'
              : 'var(--color-text-muted)',
            backgroundColor: language === key
              ? 'rgba(0, 212, 255, 0.1)'
              : 'transparent',
            border: language === key
              ? '1px solid var(--color-border-glow)'
              : '1px solid transparent',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default LanguageToggle