// useJournalLock — Automatische Sperrung des Journals
// Sperrt das Journal automatisch wenn:
// 1. Der User die Journal-Seite verlässt (aber NICHT zur Journal-Mindmap)
// 2. Der Laptop geschlossen / Bildschirm gesperrt wird (visibilitychange)
// 3. Der User einen anderen Browser-Tab öffnet (visibilitychange)
//
// WICHTIG: Navigation zu /journal/mindmap sperrt NICHT —
// das ist ein Journal-Feature und die Session bleibt offen

import { useEffect, useRef } from 'react'
import { post } from './useAPI'

// Routen die zum Journal gehören — hier wird NICHT gesperrt
const JOURNAL_ROUTES = ['/journal', '/journal/mindmap']

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

  // Refs synchron halten mit aktuellen Props
  useEffect(() => { isUnlockedRef.current = isUnlocked }, [isUnlocked])
  useEffect(() => { onLockedRef.current = onLocked }, [onLocked])

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
  // Prüft ob die neue Route noch im Journal-Bereich ist
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

  // --- 2. Visibility-Change: Laptop zu, Tab-Wechsel, Bildschirm sperren ---
  useEffect(() => {
    if (!lockOnVisibilityChange || !isUnlocked) return

    function handleVisibilityChange() {
      if (document.hidden) {
        lockJournal()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isUnlocked, lockOnVisibilityChange])
}

export default useJournalLock