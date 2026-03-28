# Mood Cache — Speichert Stimmungsanalyse-Ergebnisse pro Eintrag
# Verhindert erneute Ollama-Analyse bei jedem Tab-Wechsel
#
# Strategie: SHA-256 Hash über den entschlüsselten Inhalt
# Wenn sich der Hash nicht geändert hat → Cache nutzen
# Wenn sich der Hash geändert hat → neu analysieren + Cache aktualisieren

from sqlalchemy import Column, Integer, Float, String, DateTime
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class MoodCache(JournalBase):
    """Gecachte Mood-Analyse-Ergebnisse in der Journal-DB."""

    __tablename__ = "mood_cache"

    # Primärschlüssel = Entry-ID (1:1 Beziehung)
    entry_id = Column(Integer, primary_key=True)

    # SHA-256 Hash des entschlüsselten Inhalts (title + content)
    # Wenn sich der Inhalt ändert, ändert sich der Hash → Re-Analyse
    content_hash = Column(String, nullable=False)

    # Analyse-Ergebnisse
    score = Column(Float, nullable=False, default=0.0)
    label = Column(String, nullable=False, default="unbekannt")
    # Keywords als komma-separierter String (einfacher als JSON in SQLite)
    keywords = Column(String, nullable=False, default="")

    # Sprache der Analyse — bei Sprachwechsel wird neu analysiert
    language = Column(String, nullable=False, default="de")

    # Zeitstempel der letzten Analyse
    analyzed_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )