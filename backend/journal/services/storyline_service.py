# Storyline Service — Erkennt narrative Bögen über mehrere Einträge
# Findet thematische Entwicklungen über Zeit (z.B. "Prüfungsstress")
# Analysiert ob eine Storyline steigend, fallend oder abgeschlossen ist
#
# Nutzt Mood-Daten + Clustering + Ollama für die Analyse
# Alle Daten bleiben lokal (Ollama-only)

from backend.journal.services.journal_ai_service import journal_ai


async def detect_storylines(
    entries: list[dict],
    min_entries: int = 3,
) -> list[dict]:
    """
    Erkennt Storylines in einer chronologisch sortierten Liste von Einträgen.
    
    entries: Liste von {"id": int, "title": str, "content": str,
             "date": str, "mood_score": float}
    min_entries: Mindestanzahl Einträge für eine Storyline
    
    Gibt zurück: Liste von Storylines mit Arc-Typ und Einträgen
    """
    if len(entries) < min_entries:
        return []

    # Einträge als Kontext für Ollama aufbereiten
    entries_summary = _format_entries_for_prompt(entries)

    try:
        result = await journal_ai._chat(
            prompt=f"""Analysiere diese chronologischen Tagebucheinträge.
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
{entries_summary}""",
            max_tokens=1000,
        )
        storylines = journal_ai._parse_json(result)
        return _validate_storylines(storylines, entries)
    except Exception:
        return []


def _format_entries_for_prompt(entries: list[dict]) -> str:
    """Formatiert Einträge kompakt für den Ollama-Prompt."""
    lines = []
    for e in entries[:20]:  # Max 20 Einträge für Kontextlänge
        mood = e.get("mood_score", 0.0)
        mood_str = f" [Stimmung: {mood:+.1f}]" if mood else ""
        lines.append(
            f"ID {e['id']} ({e['date']}){mood_str}: "
            f"{e['title']} — {e['content'][:150]}"
        )
    return "\n".join(lines)


def _validate_storylines(
    storylines: list[dict],
    entries: list[dict],
) -> list[dict]:
    """Validiert und bereinigt die AI-generierten Storylines."""
    valid_ids = {e["id"] for e in entries}
    valid_arcs = {"rising", "falling", "resolved", "ongoing"}
    result = []

    for s in storylines:
        if not isinstance(s, dict):
            continue

        # Entry-IDs filtern: nur gültige behalten
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
            "title": s.get("title", "Unbenannt")[:50],
            "arc_type": arc_type,
            "confidence": round(confidence, 2),
            "entry_ids": entry_ids,
        })

    return result