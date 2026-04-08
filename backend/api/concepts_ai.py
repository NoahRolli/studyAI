# Konzept-Graph AI Service — Sync, Auto-Link, Merge-Suggestions
# Sync: Extrahiert Keywords aus Notes (Ollama) und Summaries (key_terms)
# Auto-Link: Schlägt Edges zwischen verwandten Konzepten vor
# Ollama-only — kein Claude, kein externer API-Call

import json
import re
import httpx
import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource, ConceptEdge
from backend.models.note import Note
from backend.models.summary import Summary
from backend.infra.config import OLLAMA_MODEL, OLLAMA_EMBED_MODEL
from backend.infra.ollama_connector import get_ollama_url

router = APIRouter(prefix="/api/concepts", tags=["concepts-ai"])


def _normalize_name(name: str) -> str:
    """Konzept-Name normalisieren: lowercase, trimmed."""
    return name.strip().lower()


def _parse_json_response(text: str) -> list | dict | None:
    """Ollama JSON-Antwort parsen (3-Strategie-Fallback)."""
    # Strategie 1: Markdown-Codeblock
    md_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if md_match:
        try:
            return json.loads(md_match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Strategie 2: Erstes JSON-Array oder -Objekt im Text
    json_match = re.search(r"(\[[\s\S]*?\]|\{[\s\S]*?\})", text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    # Strategie 3: Raw text
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return None


async def _ollama_chat(prompt: str) -> str:
    """Einzelner Ollama-Chat-Call, gibt Text zurück."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{base_url}/api/chat", json={
            "model": OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False, "think": False
        })
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


async def _generate_embedding(text: str) -> list[float]:
    """Generiert Embedding via nomic-embed-text."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{base_url}/api/embed", json={
            "model": OLLAMA_EMBED_MODEL, "input": text
        })
        resp.raise_for_status()
        data = resp.json()
        # Ollama gibt "embeddings" als Liste von Vektoren
        embeddings = data.get("embeddings", [])
        return embeddings[0] if embeddings else []


def _get_or_create_concept(db: Session, name: str) -> Concept:
    """Konzept holen oder neu erstellen (normalisiert)."""
    normalized = _normalize_name(name)
    if not normalized:
        return None
    concept = db.query(Concept).filter(
        Concept.name == normalized
    ).first()
    if not concept:
        concept = Concept(name=normalized, embedding_stale=True)
        db.add(concept)
        db.flush()
    return concept


def _link_source(db: Session, concept: Concept,
                 source_type: str, source_id: int,
                 relevance: float = 0.5):
    """Konzept mit Quelle verknüpfen (skip wenn existiert)."""
    existing = db.query(ConceptSource).filter(
        ConceptSource.concept_id == concept.id,
        ConceptSource.source_type == source_type,
        ConceptSource.source_id == source_id
    ).first()
    if not existing:
        db.add(ConceptSource(
            concept_id=concept.id, source_type=source_type,
            source_id=source_id, relevance=relevance
        ))


async def _extract_keywords_ollama(text: str) -> list[str]:
    """Extrahiert 3-8 Konzepte aus Text via Ollama."""
    prompt = (
        "Extract 3 to 8 key concepts from this text. "
        "Return ONLY a JSON array of lowercase strings. "
        "Example: [\"machine learning\", \"neural networks\"]\n\n"
        f"Text: {text[:2000]}"
    )
    response = await _ollama_chat(prompt)
    parsed = _parse_json_response(response)
    if isinstance(parsed, list):
        return [str(k).strip().lower() for k in parsed if isinstance(k, str)]
    return []


@router.post("/sync")
async def sync_concepts(db: Session = Depends(get_db)):
    """Scannt Notes + Summaries, extrahiert Keywords, erstellt Konzepte."""
    stats = {"new_concepts": 0, "new_links": 0, "sources_scanned": 0}

    # 1. Summaries — key_terms direkt übernehmen
    summaries = db.query(Summary).all()
    for s in summaries:
        terms = s.key_terms or []
        if isinstance(terms, str):
            try:
                terms = json.loads(terms)
            except json.JSONDecodeError:
                terms = []
        for term in terms:
            if not isinstance(term, str) or not term.strip():
                continue
            concept = _get_or_create_concept(db, term)
            if concept:
                before = db.query(ConceptSource).count()
                _link_source(db, concept, "summary", s.id, 0.7)
                after = db.query(ConceptSource).count()
                if after > before:
                    stats["new_links"] += 1
        stats["sources_scanned"] += 1

    # 2. Notes — Ollama-Extraction
    notes = db.query(Note).all()
    for note in notes:
        # Prüfen ob Note schon gescannt wurde
        existing_links = db.query(ConceptSource).filter(
            ConceptSource.source_type == "note",
            ConceptSource.source_id == note.id
        ).count()
        if existing_links > 0:
            continue
        # Text zusammenbauen
        text = f"{note.title}\n{note.content or ''}"
        keywords = await _extract_keywords_ollama(text)
        for kw in keywords:
            concept = _get_or_create_concept(db, kw)
            if concept:
                _link_source(db, concept, "note", note.id, 0.5)
                stats["new_links"] += 1
        stats["sources_scanned"] += 1

    # Neue Konzepte zählen (mit embedding_stale=True)
    stats["new_concepts"] = db.query(Concept).filter(
        Concept.embedding_stale == True
    ).count()

    db.commit()
    return stats


@router.post("/auto-link")
async def auto_link_concepts(db: Session = Depends(get_db)):
    """Ollama schlägt Edges zwischen verwandten Konzepten vor."""
    concepts = db.query(Concept).all()
    if len(concepts) < 2:
        return {"suggestions": 0}

    # Konzept-Namen als Liste für den Prompt
    names = [c.name for c in concepts]
    prompt = (
        "Given these concepts, suggest pairs that are related. "
        "For each pair, specify the relation type: "
        "related, builds_on, contradicts, or part_of. "
        "Return ONLY a JSON array of objects with "
        "source, target, and relation fields.\n\n"
        f"Concepts: {json.dumps(names)}"
    )
    response = await _ollama_chat(prompt)
    parsed = _parse_json_response(response)
    if not isinstance(parsed, list):
        return {"suggestions": 0, "error": "parse_failed"}

    count = 0
    name_to_id = {c.name: c.id for c in concepts}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        src = _normalize_name(item.get("source", ""))
        tgt = _normalize_name(item.get("target", ""))
        rel = item.get("relation", "related")
        if src not in name_to_id or tgt not in name_to_id:
            continue
        if src == tgt:
            continue
        # Prüfen ob Edge schon existiert
        exists = db.query(ConceptEdge).filter(
            ConceptEdge.source_concept_id == name_to_id[src],
            ConceptEdge.target_concept_id == name_to_id[tgt]
        ).first()
        if not exists:
            db.add(ConceptEdge(
                source_concept_id=name_to_id[src],
                target_concept_id=name_to_id[tgt],
                relation_type=rel if rel in (
                    "related", "builds_on", "contradicts", "part_of"
                ) else "related",
                strength=0.5, ai_generated=True, confirmed=None
            ))
            count += 1

    db.commit()
    return {"suggestions": count}
