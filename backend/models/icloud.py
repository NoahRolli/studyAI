"""
iCloud-Sync — Models.
- ICloudCalendar: Metadaten je gespiegelter iCloud-Kalender
- CalendarEvent wird im calendar_event.py um iCloud-Felder erweitert

Sicher gegen mehrfaches Importieren (kein metadata-Conflict).
"""

from sqlalchemy import Column, Integer, String, DateTime, func
from backend.models.database import Base


class ICloudCalendar(Base):
    """Ein iCloud-Kalender (Privat, Arbeit, Geburtstage, ...) der gespiegelt wird.

    sync_enabled=1 default — Phase 1 zieht alle Kalender. Toggle-Page
    in Phase 2 setzt das ggf. um.

    sync_token + last_sync sind fuer den Scheduler-Loop:
    - sync_token: CalDAV-Sync-Token (RFC 6578) fuer inkrementelle Syncs;
      kann NULL sein → naechster Run macht Full-Sync
    - last_sync: Zeitpunkt des letzten erfolgreichen Sync
    - last_error: bei Fehler letzten Fehler-Text behalten (UI-Banner spaeter)
    """

    __tablename__ = "icloud_calendars"

    id = Column(Integer, primary_key=True, index=True)

    # iCloud-spezifische URL des Kalenders (eindeutig)
    caldav_url = Column(String, nullable=False, unique=True)

    # Anzeigename des Kalenders (z.B. "Privat", "Arbeit")
    name = Column(String, nullable=False)

    # Original-iCloud-Farbe (Hex, z.B. "#FF2D55")
    color = Column(String, nullable=True)

    # Optional: User-Override der Farbe in Pallas (Phase 2)
    pallas_color = Column(String, nullable=True)

    # CalDAV-Sync-Token fuer inkrementelle Syncs (RFC 6578)
    sync_token = Column(String, nullable=True)

    # Toggle ob dieser Kalender vom Scheduler beruehrt wird
    # Phase 1: immer 1. Phase 2: Settings-Page kann togglen.
    sync_enabled = Column(Integer, nullable=False, default=1)

    # Zeitpunkt des letzten erfolgreichen Sync
    last_sync = Column(DateTime, nullable=True)

    # Letzter Fehler-Text (NULL wenn letzter Sync ok)
    last_error = Column(String, nullable=True)

    # Cache der Event-Anzahl fuer Settings-Page
    event_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, server_default=func.now())
