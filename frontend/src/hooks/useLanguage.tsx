// useLanguage — Context + Hook für Sprachumschaltung
// Stellt t() Funktion bereit um Labels zu übersetzen
// Sprache wird in localStorage persistiert
// Bei i18next-Migration: Nur diesen Hook austauschen

import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import translations from '../i18n'
import type { Language, Translations } from '../i18n'
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from '../i18n'

// Gespeicherte Sprache aus localStorage lesen
function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    // localStorage nicht verfügbar — Fallback
  }
  return DEFAULT_LANGUAGE
}

// Context-Shape: Aktuelle Sprache, Translations-Objekt, Wechsel-Funktion
interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translations
}

// Context erstellen (default wird nie verwendet, Provider ist Pflicht)
const LanguageContext = createContext<LanguageContextValue | null>(null)

// Provider-Props
interface LanguageProviderProps {
  children: ReactNode
}

// Provider-Komponente — wraps die ganze App in App.tsx
export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage)

  // Sprache wechseln + in localStorage speichern
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {
      // localStorage nicht verfügbar — ignorieren
    }
  }, [])

  // Translations-Objekt für aktuelle Sprache
  const t = translations[language]

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

// Hook — in jeder Komponente verwendbar
export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage muss innerhalb von LanguageProvider verwendet werden')
  }
  return context
}