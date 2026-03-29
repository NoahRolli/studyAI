"""
Hauptkalender – Event-Model.
Speichert Termine mit optionaler Wiederholung und Farbkategorien.
Komplett getrennt vom Journal (kein Zugriff auf verschlüsselte Daten).
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
    recurrence = Column(String, default="none", nullable=False)

    # Endedatum für Wiederholung (null = unbegrenzt)
    recurrence_end = Column(DateTime, nullable=True)

    # Zeitstempel
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())