# Notes AI API — Ollama-gestützte Analyse für Notizen
# Auto-Zusammenfassung, verwandte Notizen erkennen, Link-Vorschläge
# Nutzt den bestehenden OllamaProvider (MacBook/Server Fallback)
# Endpunkte:
# POST /api/notes/:id/summarize — Zusammenfassung generieren
# GET  /api/notes/:id/related   — Verwandte Notizen finden
# GET  /api/notes/:id/suggest-links — Auto-Link-Vorschläge

import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.note import Note
from backend.services.ollama_provider import OllamaProvider

router = APIRouter(tags=["notes-ai"])

# Ollama-Instanz (wiederverwendbar)
_ollama = OllamaProvider()

# HTML-Tags entfernen für Ollama-Prompts
_HTML_TAG_RE = re.compile(r'<[^>]+>')


def _strip_html(html: str) -> str:
    """HTML-Tags entfernen, nur Plaintext zurückgeben"""
    return _HTML_TAG_RE.sub('', html).strip()


@router.post("/api/notes/{note_id}/summarize")
async def summarize_note(note_id: int, db: Session = Depends(get_db)):
    """Zusammenfassung einer Notiz via Ollama generieren"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")

    plain = _strip_html(note.content)
    if len(plain) < 50:
        raise HTTPException(status_code=400, detail="Notiz zu kurz für Zusammenfassung")

    prompt = f"""Fasse die folgende Notiz in 2-3 Sätzen zusammen.
Antworte NUR mit der Zusammenfassung, kein anderer Text.

Titel: {note.title}
Inhalt:
{plain[:3000]}"""

    try:
        summary = await _ollama._chat(prompt, max_tokens=500)
        return {"summary": summary.strip()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama nicht erreichbar: {e}")


@router.get("/api/notes/{note_id}/related")
async def find_related_notes(note_id: int, db: Session = Depends(get_db)):
    """Verwandte Notizen via Ollama erkennen (Themenvergleich)"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")

    # Alle anderen Notizen laden
    others = db.query(Note).filter(Note.id != note_id).all()
    if not others:
        return []

    # Kompakte Übersicht aller Notizen für den Prompt
    other_list = "\n".join(
        f"- ID {n.id}: \"{n.title}\" — {_strip_html(n.content)[:150]}"
        for n in others
    )

    prompt = f"""Gegeben ist eine Notiz und eine Liste anderer Notizen.
Finde die Notizen die thematisch am stärksten verwandt sind.

Aktuelle Notiz:
Titel: "{note.title}"
Inhalt: {_strip_html(note.content)[:500]}

Andere Notizen:
{other_list[:3000]}

Antworte NUR im JSON-Format als Liste von IDs der verwandten Notizen,
sortiert nach Relevanz (max 5):
[{{"id": 1, "reason": "Kurze Begründung"}}]"""

    try:
        response = await _ollama._chat(prompt, max_tokens=500)
        parsed = _ollama._parse_json(response)
        # IDs validieren — nur existierende Notizen zurückgeben
        valid_ids = {n.id for n in others}
        results = []
        for item in parsed:
            nid = item.get("id")
            if nid in valid_ids:
                # Titel nachschlagen
                matched = next((n for n in others if n.id == nid), None)
                if matched:
                    results.append({
                        "id": nid,
                        "title": matched.title,
                        "reason": item.get("reason", ""),
                    })
        return results
    except Exception:
        return []


@router.get("/api/notes/{note_id}/suggest-links")
async def suggest_links(note_id: int, db: Session = Depends(get_db)):
    """Vorschläge für [[Wiki-Links]] basierend auf Notiz-Inhalt"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")

    # Alle anderen Notiz-Titel sammeln
    others = db.query(Note).filter(Note.id != note_id).all()
    if not others:
        return []

    titles = [n.title for n in others]
    plain = _strip_html(note.content)

    prompt = f"""Gegeben ist der Inhalt einer Notiz und eine Liste existierender Notiz-Titel.
Welche Titel sollten im Text als [[Wiki-Links]] verlinkt werden?
Nur Titel vorschlagen die thematisch zum Inhalt passen.

Inhalt der Notiz:
{plain[:2000]}

Existierende Notiz-Titel:
{json.dumps(titles[:50])}

Antworte NUR im JSON-Format als Liste von Titeln:
["Titel 1", "Titel 2"]"""

    try:
        response = await _ollama._chat(prompt, max_tokens=300)
        parsed = _ollama._parse_json(response)
        # Nur existierende Titel zurückgeben
        valid = [t for t in parsed if t in titles]
        return [
            {"title": t, "id": next(n.id for n in others if n.title == t)}
            for t in valid
        ]
    except Exception:
        return []
