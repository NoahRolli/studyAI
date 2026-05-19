"""
Hauptkalender – Event-Model.
Speichert Termine mit optionaler Wiederholung und Farbkategorien.
Komplett getrennt vom Journal (kein Zugriff auf verschlüsselte Daten).

Erweitert um iCloud-Sync-Felder (Mai 2026):
- source: 'manual' (Pallas-eigen) oder 'icloud' (gesynkt)
- external_uid + recurrence_id: iCloud-Identifikatoren fuer Idempotenz
- is_readonly: API blockt PATCH/DELETE bei iCloud-Events (Phase 1)
- location + timezone: bequemer Direct-Access fuer Delphi
- raw_ical: kompletter iCal-Blob als JSON (keine Datenverluste)
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, func
from backend.models.database import Base


class CalendarEvent(Base):
    """Einzelnes Kalender-Event mit optionaler Wiederholung."""

    __tablename__ = "calendar_events"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Titel des Events (Pflichtfeld)
    title = Column(String, nullable=False)

    # Beschreibung (optional, kurze Notiz)
    description = Column(String, nullable=True)

    # Start- und Endzeit (bei ganztägig: nur Datum relevant)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)

    # Ganztägiges Event (ignoriert Uhrzeiten)
    all_day = Column(Boolean, default=False, nullable=False)

    # Farbkategorie (cyan, violet, emerald, orange, pink, yellow)
    color = Column(String, default="cyan", nullable=False)

    # Wiederholung: none, daily, weekly, monthly, yearly
    # iCloud-Events nutzen IMMER 'none' — Recurrences sind als
    # expanded instances einzeln in der DB (siehe recurrence_id)
    recurrence = Column(String, default="none", nullable=False)

    # Endedatum für Wiederholung (null = unbegrenzt)
    recurrence_end = Column(DateTime, nullable=True)

    # --- iCloud-Sync-Felder (NULL fuer manual Events) ---

    # 'manual' (Pallas-eigen) oder 'icloud' (gesynkt von iCloud)
    source = Column(String, nullable=False, default="manual")

    # iCloud-UID des Master-Events (fuer Recurrence: gleiche UID
    # ueber alle Instanzen, recurrence_id unterscheidet)
    external_uid = Column(String, nullable=True)

    # FK auf icloud_calendars.id (welcher iCloud-Kalender)
    external_calendar_id = Column(Integer, nullable=True)

    # ETag aus CalDAV-Response (fuer inkrementellen Sync, Change-Detection)
    external_etag = Column(String, nullable=True)

    # Bei Recurrence-Serie: ISO-Datum der Einzelinstanz
    # (NULL bei Single-Events, gefuellt bei expanded instances)
    recurrence_id = Column(String, nullable=True)

    # Edit-Schutz: 1 fuer iCloud-Events, API verweigert PATCH/DELETE
    is_readonly = Column(Integer, nullable=False, default=0)

    # Zeitpunkt des letzten erfolgreichen Sync dieser Zeile
    last_synced = Column(DateTime, nullable=True)

    # --- iCloud-Reichdaten (bequemer Direct-Access) ---

    # Ort des Events (z.B. "Café Spitz, Basel")
    location = Column(String, nullable=True)

    # Timezone-Identifier (z.B. "Europe/Zurich")
    timezone = Column(String, nullable=True)

    # Kompletter iCal-Blob als JSON (attendees, alarms, etc.)
    # Fuer Felder die wir noch nicht als Spalten haben
    raw_ical = Column(String, nullable=True)

    # Zeitstempel
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
