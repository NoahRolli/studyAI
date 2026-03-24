// useJournalLock — Automatische Sperrung des Journals
// Sperrt das Journal automatisch wenn:
// 1. Der User die Journal-Seite verlässt (Route-Change)
// 2. Der Laptop geschlossen / Bildschirm gesperrt wird (visibilitychange)
// 3. Der User einen anderen Browser-Tab öffnet (visibilitychange)
//
// Nutzt die POST /api/journal/lock API um die Session serverseitig zu beenden
// Der AES-Key wird aus dem RAM gelöscht — Daten sind wieder verschlüsselt

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { post } from './useAPI'

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
  const location = useLocation()
  // Ref um Race-Conditions zu vermeiden (doppeltes Locken)
  const isLocking = useRef(false)

  // Lock-Funktion — ruft Backend auf und benachrichtigt Parent
  async function lockJournal() {
    if (!isUnlocked || isLocking.current) return
    isLocking.current = true
    try {
      await post('/api/journal/lock')
      onLocked()
    } catch {
      // Lock fehlgeschlagen — trotzdem Frontend-State zurücksetzen
      onLocked()
    } finally {
      isLocking.current = false
    }
  }

  // --- 1. Route-Change: Sperren wenn User /journal verlässt ---
  useEffect(() => {
    if (!lockOnNavigateAway || !isUnlocked) return
    // Wenn aktuelle Route NICHT /journal ist → sperren
    if (!location.pathname.startsWith('/journal')) {
      lockJournal()
    }
  }, [location.pathname, isUnlocked, lockOnNavigateAway])

  // --- 2. Visibility-Change: Laptop zu, Tab-Wechsel, Bildschirm sperren ---
  useEffect(() => {
    if (!lockOnVisibilityChange || !isUnlocked) return

    function handleVisibilityChange() {
      // document.hidden === true wenn Tab nicht sichtbar ist
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