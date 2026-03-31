# Storyline Service — Erkennt narrative Bögen über mehrere Einträge
# Findet thematische Entwicklungen über Zeit (z.B. "Prüfungsstress")
# Analysiert ob eine Storyline steigend, fallend oder abgeschlossen ist
#
# NEU: Storylines werden in der DB persistiert (StorylineCache)
# Nur bei neuen/geänderten Einträgen wird Ollama erneut gefragt
# Hash-Strategie: SHA-256 über alle Entry-IDs + Daten + Sprache
#
# Alle Daten bleiben lokal (Ollama-only)

import hashlib
from sqlalchemy.orm import Session

from backend.journal.services.journal_ai_service import journal_ai
from backend.journal.models.storyline import StorylineCache


def compute_entries_hash(entries: list[dict], language: str) -> str:
    """
    Berechnet SHA-256 Hash über alle Entry-IDs + Daten + Sprache.
    Ändert sich wenn Einträge hinzukommen, bearbeitet oder gelöscht werden.
    """
    parts = [f"{e['id']}:{e.get('date', '')}" for e in entries]
    raw = f"{language}|{'|'.join(sorted(parts))}"
    return hashlib.sha256(raw.encode()).hexdigest()


def load_cached_storylines(
    content_hash: str, db: Session
) -> list[dict] | None:
    """
    Lädt gecachte Storylines aus der DB.
    Gibt None zurück wenn kein Cache existiert (→ neu generieren).
    """
    cached = db.query(StorylineCache).filter(
        StorylineCache.content_hash == content_hash
    ).all()

    if not cached:
        return None

    return [
        {
            "title": s.title,
            "arc_type": s.arc_type,
            "confidence": s.confidence,
            "entry_ids": [int(x) for x in s.entry_ids.split(",") if x],
        }
        for s in cached
    ]


def save_storylines_to_cache(
    storylines: list[dict],
    content_hash: str,
    language: str,
    db: Session,
) -> None:
    """Speichert neue Storylines in der DB, löscht alte."""
    # Alte Einträge für diese Sprache entfernen
    db.query(StorylineCache).filter(
        StorylineCache.language == language
    ).delete()

    # Neue Storylines speichern
    for s in storylines:
        entry_ids_str = ",".join(str(eid) for eid in s["entry_ids"])
        db.add(StorylineCache(
            content_hash=content_hash,
            title=s["title"],
            arc_type=s["arc_type"],
            confidence=s["confidence"],
            entry_ids=entry_ids_str,
            language=language,
        ))

    db.commit()


async def detect_storylines(
    entries: list[dict],
    language: str = "de",
    db: Session | None = None,
    min_entries: int = 3,
) -> list[dict]:
    """
    Erkennt Storylines — nutzt DB-Cache wenn vorhanden.
    Nur bei neuen/geänderten Einträgen wird Ollama gefragt.
    """
    if len(entries) < min_entries:
        return []

    # Cache prüfen (nur wenn DB-Session vorhanden)
    content_hash = ""
    if db is not None:
        content_hash = compute_entries_hash(entries, language)
        cached = load_cached_storylines(content_hash, db)
        if cached is not None:
            return cached

    # Ollama-Analyse durchführen
    storylines = await _generate_storylines(entries, language)

    # Ergebnis cachen
    if db is not None and storylines:
        save_storylines_to_cache(storylines, content_hash, language, db)

    return storylines


async def _generate_storylines(
    entries: list[dict], language: str
) -> list[dict]:
    """Generiert Storylines via Ollama-Prompt."""
    entries_summary = _format_entries_for_prompt(entries, language)
    prompt = _build_prompt(entries_summary, language)
    fallback_title = "Unbenannt" if language == "de" else "Unnamed"

    try:
        result = await journal_ai._chat(prompt=prompt, max_tokens=1000)
        storylines = journal_ai._parse_json(result)
        return _validate_storylines(storylines, entries, fallback_title)
    except Exception:
        return []


def _format_entries_for_prompt(entries: list[dict], language: str) -> str:
    """Formatiert Einträge kompakt für den Ollama-Prompt."""
    mood_label = "Stimmung" if language == "de" else "Mood"
    lines = []
    for e in entries[:20]:
        mood = e.get("mood_score", 0.0)
        mood_str = f" [{mood_label}: {mood:+.1f}]" if mood else ""
        lines.append(
            f"ID {e['id']} ({e['date']}){mood_str}: "
            f"{e['title']} — {e['content'][:150]}"
        )
    return "\n".join(lines)


def _build_prompt(entries_summary: str, language: str) -> str:
    """Erstellt den sprachabhängigen Storyline-Prompt."""
    if language == "de":
        return f"""Analysiere diese chronologischen Tagebucheinträge.
Finde thematische Storylines — wiederkehrende Themen die sich entwickeln.
Für jede Storyline bestimme:
- title: kurzer Titel (max 4 Wörter)
- arc_type: "rising" (wird besser/intensiver), "falling" (klingt ab),
  "resolved" (abgeschlossen), "ongoing" (noch offen)
- confidence: 0.0-1.0 wie sicher du bist
- entry_ids: welche Einträge dazugehören (IDs aus der Liste)
Antworte NUR im JSON-Format:
[{{"title": "...", "arc_type": "rising", "confidence": 0.8, "entry_ids": [1, 3, 5]}}]
Einträge:
{entries_summary}"""
    return f"""Analyze these chronological journal entries.
Find thematic storylines — recurring themes that develop over time.
For each storyline determine:
- title: short title (4 words max)
- arc_type: "rising" (getting better/stronger), "falling" (fading),
  "resolved" (concluded), "ongoing" (still open)
- confidence: 0.0-1.0 how certain you are
- entry_ids: which entries belong to it (IDs from the list)
Respond ONLY in JSON format:
[{{"title": "...", "arc_type": "rising", "confidence": 0.8, "entry_ids": [1, 3, 5]}}]
Entries:
{entries_summary}"""


def _validate_storylines(
    storylines: list[dict],
    entries: list[dict],
    fallback_title: str = "Unbenannt",
) -> list[dict]:
    """Validiert und bereinigt die AI-generierten Storylines."""
    valid_ids = {e["id"] for e in entries}
    valid_arcs = {"rising", "falling", "resolved", "ongoing"}
    result = []
    for s in storylines:
        if not isinstance(s, dict):
            continue
        entry_ids = [
            eid for eid in s.get("entry_ids", [])
            if eid in valid_ids
        ]
        if len(entry_ids) < 2:
            continue
        arc_type = s.get("arc_type", "ongoing")
        if arc_type not in valid_arcs:
            arc_type = "ongoing"
        confidence = s.get("confidence", 0.5)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.5
        result.append({
            "title": s.get("title", fallback_title)[:50],
            "arc_type": arc_type,
            "confidence": round(confidence, 2),
            "entry_ids": entry_ids,
        })
    return result