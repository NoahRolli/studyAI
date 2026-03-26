// index.ts — i18n Zentrale: Typen, Sprachen-Registry, Export
// Bei i18next-Migration: Dieser Export wird durch i18n.init() ersetzt
// Typ wird aus de.ts abgeleitet → en.ts muss gleiche Struktur haben

import de from './de'
import en from './en'

// Verfügbare Sprachen als Union-Type
export type Language = 'de' | 'en'

// Translations-Typ basierend auf de.ts (Struktur-Check)
export type Translations = typeof de

// Sprachen-Registry — hier neue Sprachen registrieren
// en wird als Translations gecastet: Struktur muss stimmen,
// aber die String-Werte dürfen sich unterscheiden
const translations: Record<Language, Translations> = {
  de,
  en: en as unknown as Translations,
}

// Standard-Sprache
export const DEFAULT_LANGUAGE: Language = 'de'

// localStorage-Schlüssel für Persistenz
export const LANGUAGE_STORAGE_KEY = 'pallas-language'

export default translations