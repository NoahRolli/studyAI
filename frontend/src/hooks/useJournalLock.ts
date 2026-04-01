// useJournalLock — Automatische Sperrung des Journals
// Sperrt das Journal automatisch wenn:
// 1. Der User die Journal-Seite verlässt (aber NICHT zur Journal-Mindmap)
// 2. Der User 15 Minuten inaktiv ist (Tab-Wechsel, anderes Programm)
//
// WICHTIG: Navigation zu /journal/mindmap sperrt NICHT —
// das ist ein Journal-Feature und die Session bleibt offen
//
// Tab-Wechsel / anderes Programm → 15-Min-Timer
// Rückkehr vor Ablauf → Timer wird gecancelt
// Navigation weg vom Journal-Bereich → sofortige Sperrung

import { useEffect, useRef } from 'react'
import { post } from './useAPI'

// Routen die zum Journal gehören — hier wird NICHT gesperrt
const JOURNAL_ROUTES = ['/journal', '/journal/mindmap']

// Inaktivitäts-Timeout in Millisekunden (15 Minuten)
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

function isJournalRoute(): boolean {
  return JOURNAL_ROUTES.some((route) =>
    window.location.pathname.startsWith(route)
  )
}

interface UseJournalLockOptions {
  isUnlocked: boolean
  onLocked: () => void
  lockOnNavigateAway?: boolean
  lockOnVisibilityChange?: boolean
}

function useJournalLock({
  isUnlocked,
  onLocked,
  lockOnNavigateAway = true,
  lockOnVisibilityChange = true,
}: UseJournalLockOptions) {
  // Refs für aktuelle Werte — useEffect Cleanup sieht sonst veraltete States
  const isUnlockedRef = useRef(isUnlocked)
  const onLockedRef = useRef(onLocked)
  const isLocking = useRef(false)
  // Timer-Ref für Inaktivitäts-Sperrung
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs synchron halten mit aktuellen Props
  useEffect(() => { isUnlockedRef.current = isUnlocked }, [isUnlocked])
  useEffect(() => { onLockedRef.current = onLocked }, [onLocked])

  // Timer aufräumen beim Unmount
  useEffect(() => {
    return () => {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current)
      }
    }
  }, [])

  // Lock-Funktion — ruft Backend auf und benachrichtigt Parent
  async function lockJournal() {
    if (!isUnlockedRef.current || isLocking.current) return
    isLocking.current = true
    try {
      await post('/api/journal/lock')
      onLockedRef.current()
    } catch {
      onLockedRef.current()
    } finally {
      isLocking.current = false
    }
  }

  // --- 1. Unmount: Sperren wenn Journal-Bereich verlassen wird ---
  // /journal → /journal/mindmap = NICHT sperren
  // /journal → /dashboard = SPERREN
  useEffect(() => {
    if (!lockOnNavigateAway) return
    return () => {
      if (isUnlockedRef.current) {
        // Kleines Delay damit React Router die URL aktualisiert hat
        setTimeout(() => {
          if (!isJournalRoute()) {
            post('/api/journal/lock').catch(() => {})
          }
        }, 50)
      }
    }
  }, [lockOnNavigateAway])

  // --- 2. Visibility-Change: Tab-Wechsel / anderes Programm ---
  // Hidden → 15-Min-Timer starten
  // Visible → Timer canceln, Journal bleibt offen
  useEffect(() => {
    if (!lockOnVisibilityChange || !isUnlocked) return

    function handleVisibilityChange() {
      if (document.hidden) {
        // Tab wurde versteckt → Timer starten
        inactivityTimer.current = setTimeout(() => {
          lockJournal()
        }, INACTIVITY_TIMEOUT_MS)
      } else {
        // Tab ist wieder sichtbar → Timer canceln
        if (inactivityTimer.current) {
          clearTimeout(inactivityTimer.current)
          inactivityTimer.current = null
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // Timer aufräumen wenn Effekt neu läuft
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current)
        inactivityTimer.current = null
      }
    }
  }, [isUnlocked, lockOnVisibilityChange])
}

export default useJournalLock
