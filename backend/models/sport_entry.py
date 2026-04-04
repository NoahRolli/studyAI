# SportEntry — Einzelner Sport-Eintrag im Hauptkalender
# Verknüpft mit Datum, nicht mit CalendarEvent
# Journal-Insights kann diese Daten für Korrelation lesen

from sqlalchemy import Column, Integer, String, Text, Date, func, DateTime
from backend.models.database import Base


class SportEntry(Base):
    """Sport-Eintrag mit Typ, Dauer, Intensität und Notiz."""

    __tablename__ = "sport_entries"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Datum des Trainings
    date = Column(Date, nullable=False, index=True)

    # Sportart (Freitext, z.B. "Laufen", "Gym", "Schwimmen")
    sport_type = Column(String, nullable=False)

    # Dauer in Minuten
    duration_min = Column(Integer, nullable=True)

    # Intensität 1-5 (1=leicht, 5=maximal)
    intensity = Column(Integer, nullable=True)

    # Optionale Notiz
    note = Column(Text, nullable=True)

    # Zeitstempel
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
