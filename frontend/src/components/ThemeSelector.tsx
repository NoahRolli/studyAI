// ThemeSelector — Toggle-Button zum Wechseln des Designs
// Zeigt aktuelles Theme an, klicken öffnet Dropdown
// Visuell konsistent mit LanguageToggle in der Sidebar

import { useState, useRef, useEffect } from 'react'
import { useTheme, THEMES } from '../hooks/useTheme'
import type { ThemeKey } from '../hooks/useTheme'

function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Dropdown schliessen bei Klick ausserhalb
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Theme-Keys als Array
  const themeKeys = Object.keys(THEMES) as ThemeKey[]

  return (
    <div ref={ref} className="relative w-fit">
      {/* Aktuelles Theme als Button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-300 border"
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '0.65rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          borderColor: open ? 'var(--color-border-glow)' : 'var(--color-border)',
          background: open ? 'rgba(0, 212, 255, 0.05)' : 'transparent',
        }}
      >
        {/* Farbiger Punkt als Theme-Indikator */}
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
        {THEMES[theme]}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 rounded-md border overflow-hidden animate-fade-in"
          style={{
            backgroundColor: 'var(--color-bg-elevated)',
            borderColor: 'var(--color-border-glow)',
            boxShadow: 'var(--color-primary-glow)',
            minWidth: '100%',
          }}
        >
          {themeKeys.map((key) => (
            <button
              key={key}
              onClick={() => {
                setTheme(key)
                setOpen(false)
              }}
              className="w-full px-3 py-2 text-left transition-all duration-200 flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: key === theme
                  ? 'var(--color-primary)'
                  : 'var(--color-text-secondary)',
                background: key === theme
                  ? 'rgba(0, 212, 255, 0.1)'
                  : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (key !== theme) {
                  e.currentTarget.style.background = 'rgba(0, 212, 255, 0.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (key !== theme) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {key === theme && (
                <span style={{ color: 'var(--color-primary)' }}>●</span>
              )}
              {THEMES[key]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ThemeSelector