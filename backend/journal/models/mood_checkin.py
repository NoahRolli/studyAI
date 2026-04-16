# MoodCheckIn — Mehrfache Stimmungserfassung pro Tag
# Unabhaengig vom Journal, wird auf der Welcome-Page erfasst
# Moods als JSON-Array, Score berechnet aus Gewichtung
# Tageswert: Durchschnitt aller Check-Ins + Journal-Mood

from sqlalchemy import Column, Integer, Float, String, DateTime, Text
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


# Mood-Kategorien mit Gewichtung fuer Score-Berechnung
# Erweitert auf 24 Kategorien (12 positiv + 12 negativ)
# Cluster: Energie / Ruhe / Kognitiv / Emotion / Antrieb / Sozial
MOOD_WEIGHTS = {
    # === POSITIV (12) ===
    # Energie
    "energized": 2.0,
    "refreshed": 1.5,
    # Ruhe
    "calm": 1.5,
    "grounded": 1.5,
    # Kognitiv
    "focused": 1.5,
    # Emotion
    "happy": 2.0,
    "grateful": 1.5,
    "proud": 1.5,
    # Antrieb
    "motivated": 1.5,
    "creative": 1.0,
    # Sozial
    "social": 1.0,
    "connected": 1.5,

    # === NEGATIV (12) ===
    # Energie
    "tired": -1.5,
    "exhausted": -2.0,
    "restless": -1.0,
    # Stress
    "stressed": -2.0,
    "anxious": -2.0,
    "overwhelmed": -2.0,
    # Emotion
    "sad": -2.0,
    "irritated": -1.5,
    "angry": -2.0,
    # Kognitiv
    "unfocused": -1.0,
    "foggy": -1.5,
    # Sozial
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

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    moods = Column(Text, nullable=False)  # JSON-Array von Mood-Keys
    score = Column(Float, nullable=False)  # 1.0 - 10.0
    note = Column(Text, nullable=True)  # Optionaler Kommentar
