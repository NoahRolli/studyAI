# Note Model — Markdown-Notizen für das Pallas Notes-Modul
# Jede Notiz hat Titel, Markdown-Inhalt, und Tags
# Bidirektionale Links werden über [[Notiz-Titel]] Syntax im Content aufgelöst
# Gespeichert in der Haupt-DB (pallas.db), NICHT in der Journal-DB

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from backend.models.database import Base


class Note(Base):
    """Einzelne Notiz — Grundbaustein für das Pallas Second Brain"""
    __tablename__ = "notes"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Titel der Notiz (einzigartig für [[Link]] Auflösung)
    title = Column(String, nullable=False, unique=True, index=True)

    # Markdown-Inhalt — kann [[Links]], Tags, und beliebigen Text enthalten
    content = Column(Text, nullable=False, default="")

    # Komma-separierte Tags für Kategorisierung (z.B. "python,projekt,idee")
    tags = Column(String, nullable=True)

    # Zeitstempel
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
