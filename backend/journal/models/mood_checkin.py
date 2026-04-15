# MoodCheckIn — Mehrfache Stimmungserfassung pro Tag
# Unabhaengig vom Journal, wird auf der Welcome-Page erfasst
# Moods als JSON-Array, Score berechnet aus Gewichtung
# Tageswert: Durchschnitt aller Check-Ins + Journal-Mood

from sqlalchemy import Column, Integer, Float, String, DateTime, Text
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from backend.journal.models.journal_database import JournalBase


# Mood-Kategorien mit Gewichtung fuer Score-Berechnung
MOOD_WEIGHTS = {
    # Positive (+)
    "energized": 2.0,
    "calm": 1.5,
    "focused": 1.5,
    "happy": 2.0,
    "motivated": 1.5,
    "creative": 1.0,
    "social": 1.0,
    # Negative (-)
    "tired": -1.5,
    "stressed": -2.0,
    "anxious": -2.0,
    "sad": -2.0,
    "irritated": -1.5,
    "unfocused": -1.0,
    "lonely": -1.5,
}

# Score-Bereich: 1-10 (5 = neutral)
SCORE_BASELINE = 5.0
SCORE_MIN = 1.0
SCORE_MAX = 10.0


def calculate_mood_score(moods: list[str]) -> float:
    """Berechnet Score aus ausgewaehlten Moods (1.0 bis 10.0)."""
    if not moods:
        return SCORE_BASELINE
    total = sum(MOOD_WEIGHTS.get(m, 0) for m in moods)
    score = SCORE_BASELINE + total
    return round(max(SCORE_MIN, min(SCORE_MAX, score)), 1)


class MoodCheckIn(JournalBase):
    """Stimmungserfassung — mehrere pro Tag moeglich."""

    __tablename__ = "mood_checkins"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Exakter Zeitpunkt der Erfassung
    timestamp = Column(
        DateTime, nullable=False,
        default=lambda: datetime.now(ZoneInfo("Europe/Zurich")),
    )

    # Datum fuer Aggregation (YYYY-MM-DD)
    date = Column(String, nullable=False)

    # Ausgewaehlte Moods als JSON-Array
    moods = Column(Text, nullable=False, default="[]")

    # Berechneter Score (1.0 - 10.0)
    score = Column(Float, nullable=False, default=5.0)

    # Optionaler kurzer Kommentar
    note = Column(Text, nullable=True)
