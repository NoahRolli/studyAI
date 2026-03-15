# Mood Service — Stimmungsanalyse für Journal-Einträge
# Nutzt JournalAIService (Ollama-only) für Sentiment-Analyse
# Speichert Mood-Daten pro Eintrag in der Journal-DB
#
# Score-Skala: -1.0 (sehr negativ) bis 1.0 (sehr positiv)
# Label: Freitext, z.B. "freudig", "nachdenklich", "traurig"

from sqlalchemy.orm import Session
from backend.journal.services.journal_ai_service import journal_ai
from backend.journal.models.journal_database import get_journal_db


# Mood-Daten werden als JSON-Feld im Entry gespeichert
# Alternativ: eigene Tabelle (machen wir wenn nötig)


async def analyze_entry_mood(
    entry_id: int,
    title: str,
    content: str,
) -> dict:
    """
    Analysiert die Stimmung eines entschlüsselten Eintrags.
    Wird NACH der Entschlüsselung aufgerufen — arbeitet nur mit Klartext.
    
    Gibt zurück: {"entry_id": int, "score": float, "label": str, "keywords": list}
    """
    # Prüfen ob Ollama verfügbar ist
    if not await journal_ai.is_available():
        return {
            "entry_id": entry_id,
            "score": 0.0,
            "label": "nicht verfügbar",
            "keywords": [],
            "error": "Ollama nicht erreichbar",
        }

    # AI-Analyse durchführen
    result = await journal_ai.analyze_mood(title, content)

    return {
        "entry_id": entry_id,
        "score": _clamp_score(result.get("score", 0.0)),
        "label": result.get("label", "unbekannt"),
        "keywords": result.get("keywords", []),
    }


async def analyze_multiple_entries(
    entries: list[dict],
) -> list[dict]:
    """
    Analysiert die Stimmung mehrerer Einträge.
    Nützlich für Zeitraum-Übersichten (Woche/Monat).
    
    entries: Liste von {"id": int, "title": str, "content": str}
    """
    results = []
    for entry in entries:
        mood = await analyze_entry_mood(
            entry_id=entry["id"],
            title=entry["title"],
            content=entry["content"],
        )
        results.append(mood)
    return results


def _clamp_score(score: float) -> float:
    """Begrenzt den Score auf den Bereich -1.0 bis 1.0."""
    try:
        return max(-1.0, min(1.0, float(score)))
    except (TypeError, ValueError):
        return 0.0