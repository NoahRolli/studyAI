# Storyline Service — Erkennt narrative Bögen über mehrere Einträge
# Findet thematische Entwicklungen über Zeit (z.B. "Prüfungsstress")
# Analysiert ob eine Storyline steigend, fallend oder abgeschlossen ist
#
# Nutzt Ollama für die Analyse — sprachabhängig (de/en)
# Alle Daten bleiben lokal (Ollama-only)

from backend.journal.services.journal_ai_service import journal_ai


async def detect_storylines(
    entries: list[dict],
    language: str = "de",
    min_entries: int = 3,
) -> list[dict]:
    """
    Erkennt Storylines in einer chronologisch sortierten Liste von Einträgen.

    entries: Liste von {"id": int, "title": str, "content": str,
             "date": str, "mood_score": float}
    language: Sprache für die AI-Analyse (de oder en)
    min_entries: Mindestanzahl Einträge für eine Storyline

    Gibt zurück: Liste von Storylines mit Arc-Typ und Einträgen
    """
    if len(entries) < min_entries:
        return []

    # Einträge als Kontext für Ollama aufbereiten
    entries_summary = _format_entries_for_prompt(entries, language)

    # Sprachabhängiger Prompt
    if language == "de":
        prompt = f"""Analysiere diese chronologischen Tagebucheinträge.
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
        fallback_title = "Unbenannt"
    else:
        prompt = f"""Analyze these chronological journal entries.
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
        fallback_title = "Unnamed"

    try:
        result = await journal_ai._chat(prompt=prompt, max_tokens=1000)
        storylines = journal_ai._parse_json(result)
        return _validate_storylines(storylines, entries, fallback_title)
    except Exception:
        return []


def _format_entries_for_prompt(entries: list[dict], language: str = "de") -> str:
    """Formatiert Einträge kompakt für den Ollama-Prompt."""
    mood_label = "Stimmung" if language == "de" else "Mood"
    lines = []
    for e in entries[:20]:  # Max 20 Einträge für Kontextlänge
        mood = e.get("mood_score", 0.0)
        mood_str = f" [{mood_label}: {mood:+.1f}]" if mood else ""
        lines.append(
            f"ID {e['id']} ({e['date']}){mood_str}: "
            f"{e['title']} — {e['content'][:150]}"
        )
    return "\n".join(lines)


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
            "title": s.get("title", fallback_title)[:50],
            "arc_type": arc_type,
            "confidence": round(confidence, 2),
            "entry_ids": entry_ids,
        })

    return result