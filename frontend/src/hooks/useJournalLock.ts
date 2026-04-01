// useJournalLock — Automatische Sperrung des Journals
// Sperrt das Journal automatisch nach 15 Minuten Inaktivität:
// 1. Der User navigiert weg vom Journal-Bereich (aber NICHT zur Journal-Mindmap)
// 2. Der User wechselt den Browser-Tab oder zu einem anderen Programm
//
// WICHTIG: Navigation zu /journal/mindmap sperrt NICHT —
// das ist ein Journal-Feature und die Session bleibt offen
//
// Manueller Lock-Button sperrt sofort (über lockJournal im Parent)
// Timer wird gecancelt wenn User zurückkehrt

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
}

function useJournalLock({
  isUnlocked,
  onLocked,
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

  // Hilfsfunktion: Laufenden Timer abbrechen
  function clearLockTimer() {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current)
      inactivityTimer.current = null
    }
  }

  // Hilfsfunktion: 15-Min-Timer starten (nur wenn nicht schon aktiv)
  function startLockTimer() {
    if (inactivityTimer.current) return
    inactivityTimer.current = setTimeout(() => {
      lockJournal()
    }, INACTIVITY_TIMEOUT_MS)
  }

  // Timer aufräumen beim Unmount des Hooks
  useEffect(() => {
    return () => clearLockTimer()
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

  // --- 1. Unmount: Timer starten wenn Journal-Bereich verlassen wird ---
  // /journal → /journal/mindmap = NICHT starten
  // /journal → /dashboard = Timer starten (15 Min)
  useEffect(() => {
    return () => {
      if (isUnlockedRef.current) {
        setTimeout(() => {
          if (!isJournalRoute()) {
            startLockTimer()
          }
        }, 50)
      }
    }
  }, [])

  // --- 2. Rückkehr zum Journal: Timer canceln ---
  useEffect(() => {
    if (isUnlocked && isJournalRoute()) {
      clearLockTimer()
    }
  }, [isUnlocked])

  // --- 3. Visibility-Change: Tab-Wechsel / anderes Programm ---
  // Hidden → Timer starten
  // Visible → Timer canceln
  useEffect(() => {
    if (!isUnlocked) return

    function handleVisibilityChange() {
      if (document.hidden) {
        startLockTimer()
      } else {
        clearLockTimer()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isUnlocked])
}

export default useJournalLock
