// Provider Hook — Verwaltet den aktiven AI-Provider
// Holt Status von /api/settings/provider, erlaubt Switching
// Pollt nicht — wird bei Mount geladen + bei Änderung aktualisiert

import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''

// Provider-Typen
export type ProviderId = 'ollama_local' | 'ollama_server' | 'groq'

export interface ProviderSettings {
  global: ProviderId
  pages: Record<string, ProviderId>
  available: ProviderId[]
  models: Record<ProviderId, string>
  status: Record<ProviderId, boolean>
}

// Display-Namen und Farben für UI
export const PROVIDER_META: Record<ProviderId, { label: string; short: string; color: string }> = {
  ollama_local: { label: 'Ollama MacBook (gemma4:e2b)', short: 'Local', color: 'var(--color-success)' },
  ollama_server: { label: 'Ollama Server (gemma4:e4b)', short: 'Server', color: 'var(--color-warning)' },
  groq: { label: 'Groq Cloud (llama-3.3-70b)', short: 'Groq', color: 'var(--color-primary)' },
}

export function useProvider() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [loading, setLoading] = useState(true)

  // Status laden
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/api/settings/provider', {
        credentials: 'include',
      })
      if (res.ok) {
        setSettings(await res.json())
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Globalen Provider wechseln
  const setGlobal = useCallback(async (provider: ProviderId) => {
    try {
      const res = await fetch(API_BASE + '/api/settings/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider }),
      })
      if (res.ok) await refresh()
    } catch {
      // Stille Fehlerbehandlung
    }
  }, [refresh])

  // Page-Override setzen (null = entfernen)
  const setPageOverride = useCallback(async (page: string, provider: ProviderId | null) => {
    try {
      const res = await fetch(API_BASE + '/api/settings/provider/page', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ page, provider }),
      })
      if (res.ok) await refresh()
    } catch {
      // Stille Fehlerbehandlung
    }
  }, [refresh])

  return { settings, loading, setGlobal, setPageOverride, refresh }
}
