# Journal Session Service
# Verwaltet die Journal-Session: Key im RAM, Unlock/Lock, Timeout.
# Der AES-Key lebt NUR im RAM und wird bei Lock oder Server-Neustart gelöscht.
#
# Wird von auth.py und entries.py importiert:
# - session_manager.unlock(aes_key) → Key im RAM speichern
# - session_manager.lock() → Key löschen
# - session_manager.get_key() → Key abrufen
# - is_session_active() → Schneller Check ob entsperrt

import time
from backend.journal.infra.journal_config import SESSION_TIMEOUT_MINUTES


class SessionManager:
    """
    Hält den AES-Key im RAM solange das Journal entsperrt ist.
    Singleton — es gibt nur eine Instanz (session_manager).
    """

    def __init__(self):
        # Key und Zeitstempel — None wenn gesperrt
        self._aes_key: bytes | None = None
        self._last_activity: float | None = None

    def unlock(self, aes_key: bytes) -> None:
        """
        Entsperrt das Journal: speichert den AES-Key im RAM.
        Wird von auth.py nach erfolgreicher Passwort-Prüfung aufgerufen.
        """
        self._aes_key = aes_key
        self._last_activity = time.time()

    def lock(self) -> None:
        """
        Sperrt das Journal: löscht den AES-Key aus dem RAM.
        Wird aufgerufen bei: manuellem Lock, Timeout, Tab-Wechsel, etc.
        """
        self._aes_key = None
        self._last_activity = None

    def get_key(self) -> bytes:
        """
        Gibt den AES-Key zurück, falls aktiv und nicht abgelaufen.
        Aktualisiert den Aktivitäts-Zeitstempel bei jedem Zugriff.

        Returns:
            32-byte AES-256 Schlüssel

        Raises:
            RuntimeError: Wenn Journal gesperrt oder Session abgelaufen
        """
        if self._aes_key is None:
            raise RuntimeError("Journal ist gesperrt.")

        # Timeout prüfen
        elapsed_minutes = (time.time() - self._last_activity) / 60
        if elapsed_minutes > SESSION_TIMEOUT_MINUTES:
            self.lock()
            raise RuntimeError("Session abgelaufen. Bitte erneut entsperren.")

        # Aktivität aktualisieren (Reset des Timeout-Timers)
        self._last_activity = time.time()
        return self._aes_key

    def is_active(self) -> bool:
        """
        Schneller Check ob das Journal entsperrt ist.
        Prüft auch den Timeout.
        """
        if self._aes_key is None:
            return False

        # Timeout prüfen
        elapsed_minutes = (time.time() - self._last_activity) / 60
        if elapsed_minutes > SESSION_TIMEOUT_MINUTES:
            self.lock()
            return False

        return True


# Globale Instanz — wird von auth.py und entries.py importiert
session_manager = SessionManager()


def is_session_active() -> bool:
    """
    Hilfsfunktion — ruft session_manager.is_active() auf.
    Wird von dependencies.py importiert.
    """
    return session_manager.is_active()
