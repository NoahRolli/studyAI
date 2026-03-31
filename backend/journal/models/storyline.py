# Storyline Cache — Persistiert erkannte narrative Bögen
# Verhindert dass Storylines bei jedem Aufruf neu generiert werden
#
# Strategie: SHA-256 Hash über alle Entry-IDs + updated_at
# Wenn sich der Hash nicht geändert hat → Cache nutzen
# Wenn neue Einträge dazukommen oder sich ändern → neu generieren
#
# Jede Storyline wird als eigene Zeile gespeichert
# Alle Storylines einer Generation teilen denselben content_hash

from sqlalchemy import Column, Integer, Float, String, DateTime
from datetime import datetime, timezone

from backend.journal.models.journal_database import JournalBase


class StorylineCache(JournalBase):
    """Gecachte Storyline-Ergebnisse in der Journal-DB."""

    __tablename__ = "storyline_cache"

    # Auto-Increment ID (mehrere Storylines pro Generation)
    id = Column(Integer, primary_key=True, autoincrement=True)

    # SHA-256 Hash über alle Entry-IDs + updated_at Timestamps
    # Ändert sich wenn Einträge hinzukommen oder bearbeitet werden
    content_hash = Column(String, nullable=False, index=True)

    # Storyline-Daten
    title = Column(String, nullable=False)
    arc_type = Column(String, nullable=False, default="ongoing")
    confidence = Column(Float, nullable=False, default=0.5)

    # Verknüpfte Entry-IDs als komma-separierter String
    # z.B. "1,3,5" — einfacher als JSON in SQLite
    entry_ids = Column(String, nullable=False, default="")

    # Sprache der Analyse — bei Sprachwechsel wird neu generiert
    language = Column(String, nullable=False, default="de")

    # Zeitstempel der Generierung
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
    )