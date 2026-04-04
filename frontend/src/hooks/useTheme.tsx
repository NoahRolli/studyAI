// useTheme — Theme-Management für Pallas
// Speichert aktives Theme in localStorage unter 'pallas-theme'
// Setzt data-theme Attribut auf <html> für CSS-Variable-Overrides
// Themes: HUD (cyan glow) + Dark (monochrom, kein glow)

import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

// Verfügbare Themes
export const THEMES = {
  hud: 'HUD',
  dark: 'Dark',
} as const

export type ThemeKey = keyof typeof THEMES

interface ThemeContextType {
  theme: ThemeKey
  setTheme: (t: ThemeKey) => void
  themeLabel: string
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_KEY = 'pallas-theme'

// Theme auf <html> setzen — aktiviert die CSS-Variablen
function applyTheme(theme: ThemeKey) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    // Migration: professional → dark
    if (stored === 'professional') return 'dark'
    if (stored && stored in THEMES) return stored as ThemeKey
    return 'hud'
  })

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    applyTheme(theme)
  }, [])

  function setTheme(t: ThemeKey) {
    setThemeState(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeLabel: THEMES[theme] }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden')
  return ctx
}
