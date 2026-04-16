# Unlinked Mentions — Konzeptnamen in Notes/Summaries finden
# die nicht per WikiLink oder ConceptSource verknuepft sind
# Reines String-Matching, kein AI noetig

import re
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource
from backend.models.note import Note
from backend.models.summary import Summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts", tags=["concepts"])

# HTML-Tags entfernen fuer Plaintext-Suche
TAG_RE = re.compile(r"<[^>]+>")
# WikiLink-Titel aus data-wiki-title extrahieren
WIKI_TITLE_RE = re.compile(r'data-wiki-title="([^"]*)"', re.IGNORECASE)


def _strip_html(html: str) -> str:
    """HTML-Tags entfernen, Entities behalten."""
    return TAG_RE.sub(" ", html).strip()


def _extract_wiki_titles(html: str) -> set[str]:
    """Alle bereits verlinkten WikiLink-Titel aus HTML extrahieren."""
    return {t.lower() for t in WIKI_TITLE_RE.findall(html)}


def _find_mentions(text: str, name: str) -> list[str]:
    """Findet alle Vorkommen von name im Text, gibt Kontext-Snippets zurueck."""
    # Wortgrenzen-Match, case-insensitive
    pattern = re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
    snippets = []
    for match in pattern.finditer(text):
        start = max(0, match.start() - 50)
        end = min(len(text), match.end() + 50)
        snippet = text[start:end].strip()
        if start > 0:
            snippet = "..." + snippet
        if end < len(text):
            snippet = snippet + "..."
        snippets.append(snippet)
    return snippets


@router.get("/unlinked-mentions")
def get_unlinked_mentions(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    """Findet Konzeptnamen in Notes/Summaries ohne WikiLink oder Source-Verknuepfung."""
    # Alle Konzepte laden (min. 3 Zeichen, sonst zu viele Falsch-Positive)
    concepts = db.query(Concept).filter(
        Concept.name.isnot(None)
    ).all()
    concept_map = {c.name.lower(): c for c in concepts if len(c.name) >= 3}

    if not concept_map:
        return {"mentions": [], "total": 0}

    # Bestehende Source-Verknuepfungen laden (concept_id → set von (type, id))
    existing_sources = db.query(
        ConceptSource.concept_id,
        ConceptSource.source_type,
        ConceptSource.source_id,
    ).all()
    linked_set = {
        (cs.concept_id, cs.source_type, cs.source_id)
        for cs in existing_sources
    }

    mentions = []

    # Notes scannen
    notes = db.query(Note).all()
    for note in notes:
        html = (note.content or "")
        wiki_titles = _extract_wiki_titles(html)
        plaintext = _strip_html(html)
        # Auch Titel durchsuchen
        full_text = f"{note.title} {plaintext}"

        for name, concept in concept_map.items():
            # Skip wenn Konzeptname == Note-Titel (Selbstreferenz)
            if name == note.title.lower():
                continue
            # Skip wenn bereits per WikiLink verlinkt
            if name in wiki_titles:
                continue
            # Skip wenn bereits per ConceptSource verknuepft
            if (concept.id, "note", note.id) in linked_set:
                continue
            # Suchen
            snippets = _find_mentions(full_text, name)
            if snippets:
                mentions.append({
                    "concept_id": concept.id,
                    "concept_name": concept.name,
                    "source_type": "note",
                    "source_id": note.id,
                    "source_title": note.title,
                    "snippets": snippets[:3],  # Max 3 Snippets pro Fund
                    "count": len(snippets),
                })

    # Summaries scannen
    summaries = db.query(Summary).all()
    for summary in summaries:
        html = (summary.content or "")
        wiki_titles = _extract_wiki_titles(html)
        plaintext = _strip_html(html)
        full_text = f"{summary.title or ''} {plaintext}"

        for name, concept in concept_map.items():
            if name == (summary.title or "").lower():
                continue
            if name in wiki_titles:
                continue
            if (concept.id, "summary", summary.id) in linked_set:
                continue
            snippets = _find_mentions(full_text, name)
            if snippets:
                mentions.append({
                    "concept_id": concept.id,
                    "concept_name": concept.name,
                    "source_type": "summary",
                    "source_id": summary.id,
                    "source_title": summary.title or f"Summary #{summary.id}",
                    "snippets": snippets[:3],
                    "count": len(snippets),
                })

    # Sortieren: meiste Erwaehnungen zuerst
    mentions.sort(key=lambda m: m["count"], reverse=True)

    return {
        "mentions": mentions[:limit],
        "total": len(mentions),
    }


@router.post("/unlinked-mentions/{concept_id}/link")
def link_mention(
    concept_id: int,
    source_type: str = Query(...),
    source_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Erstellt ConceptSource-Verknuepfung fuer eine Unlinked Mention."""
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        return {"error": "Konzept nicht gefunden"}

    # Pruefen ob schon verknuepft
    existing = db.query(ConceptSource).filter(
        ConceptSource.concept_id == concept_id,
        ConceptSource.source_type == source_type,
        ConceptSource.source_id == source_id,
    ).first()
    if existing:
        return {"status": "already_linked"}

    db.add(ConceptSource(
        concept_id=concept_id,
        source_type=source_type,
        source_id=source_id,
        relevance=0.7,  # Hoeher als Default weil User bestaetigt
    ))
    db.commit()
    return {"status": "linked", "concept_name": concept.name}


@router.post("/unlinked-mentions/{concept_id}/dismiss")
def dismiss_mention(
    concept_id: int,
    source_type: str = Query(...),
    source_id: int = Query(...),
):
    """Markiert einen Vorschlag als irrelevant (kein DB-Eintrag, nur im Frontend)."""
    # Dismissed werden im Frontend per localStorage gespeichert
    # Kein Backend-Eintrag noetig — spart DB-Komplexitaet
    return {"status": "dismissed"}
