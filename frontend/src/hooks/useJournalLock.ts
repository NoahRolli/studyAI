// useJournalLock — Automatische Sperrung des Journals
// Sperrt das Journal automatisch wenn:
// 1. Der User die Journal-Seite verlässt (Komponente wird unmounted)
// 2. Der Laptop geschlossen / Bildschirm gesperrt wird (visibilitychange)
// 3. Der User einen anderen Browser-Tab öffnet (visibilitychange)
//
// Nutzt die POST /api/journal/lock API um die Session serverseitig zu beenden
// Der AES-Key wird aus dem RAM gelöscht — Daten sind wieder verschlüsselt
//
// WICHTIG: Route-Change Lock funktioniert über useEffect Cleanup (return),
// weil die Journal-Komponente beim Navigieren unmounted wird.
// Zu dem Zeitpunkt sind State-Werte veraltet — darum Refs für aktuelle Werte.

import { useEffect, useRef } from 'react'
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
      // Lock fehlgeschlagen — trotzdem Frontend-State zurücksetzen
      onLockedRef.current()
    } finally {
      isLocking.current = false
    }
  }

  // --- 1. Unmount: Sperren wenn Journal-Komponente verlassen wird ---
  // useEffect mit leerem Array [] → Cleanup läuft nur beim Unmount
  // Das passiert wenn der User z.B. zum Dashboard navigiert
  useEffect(() => {
    if (!lockOnNavigateAway) return
    return () => {
      // Cleanup: Journal-Seite wird verlassen → sperren
      if (isUnlockedRef.current) {
        // fire-and-forget: Backend sperrt die Session
        post('/api/journal/lock').catch(() => {})
      }
    }
  }, [lockOnNavigateAway])

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