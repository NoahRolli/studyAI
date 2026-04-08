# Relations AI — Ollama-basierte Erkennung von Wissensrelationen
# Nutzt bestätigte + abgelehnte concept_edges als Kontext (Learning Loop)
# Vorschläge werden als concept_edges mit origin='ai_suggested' gespeichert

import json
import re
import logging
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge
from backend.models.relation import RelationType
from backend.infra.config import OLLAMA_MODEL
from backend.infra.ollama_connector import get_ollama_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/relations", tags=["relations-ai"])


async def _ollama_chat(prompt: str, system: str = "") -> str:
    """Ollama Chat-Anfrage mit Timeout"""
    url = await get_ollama_url()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{url}/api/chat", json={
                "model": OLLAMA_MODEL, "messages": messages,
                "stream": False, "format": "json", "think": False,
            })
            data = resp.json()
            return data.get("message", {}).get("content", "")
    except Exception as e:
        logger.error(f"Ollama Chat-Fehler: {e}")
        return ""


def _parse_json(text: str) -> list:
    """JSON aus Ollama-Antwort extrahieren"""
    cleaned = text.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()
    try:
        result = json.loads(cleaned)
        if isinstance(result, dict) and "relations" in result:
            return result["relations"]
        if isinstance(result, list):
            return result
        return []
    except json.JSONDecodeError:
        logger.warning(f"JSON-Parse fehlgeschlagen: {cleaned[:200]}")
        return []


def _get_confirmed_edges(db: Session) -> list[dict]:
    """Bestätigte Edges als Positivbeispiele für Learning Loop"""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status == "confirmed"
    ).all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    concept_map = {c.id: c.name for c in db.query(Concept).all()}
    return [{
        "source": concept_map.get(e.source_concept_id, "?"),
        "target": concept_map.get(e.target_concept_id, "?"),
        "type": type_map.get(e.relation_type_id, "unknown"),
        "reason": e.reason or "",
    } for e in edges]


def _get_rejected_edges(db: Session) -> list[dict]:
    """Abgelehnte Edges als Negativbeispiele"""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status == "rejected"
    ).all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    concept_map = {c.id: c.name for c in db.query(Concept).all()}
    return [{
        "source": concept_map.get(e.source_concept_id, "?"),
        "target": concept_map.get(e.target_concept_id, "?"),
        "type": type_map.get(e.relation_type_id, "unknown"),
    } for e in edges]


def _get_existing_pairs(db: Session) -> set:
    """Bestehende Paare (nicht-rejected)"""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected"
    ).all()
    pairs = set()
    for e in edges:
        pairs.add((e.source_concept_id, e.target_concept_id))
        pairs.add((e.target_concept_id, e.source_concept_id))
    return pairs


def _get_rejected_pairs(db: Session) -> set:
    """Abgelehnte Paare — nie wieder vorschlagen"""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status == "rejected"
    ).all()
    pairs = set()
    for e in edges:
        pairs.add((e.source_concept_id, e.target_concept_id))
        pairs.add((e.target_concept_id, e.source_concept_id))
    return pairs


@router.post("/detect")
async def detect_relations(db: Session = Depends(get_db)):
    """Ollama analysiert Konzepte und schlägt typisierte Edges vor"""
    concepts = db.query(Concept).all()
    if len(concepts) < 2:
        return {"suggested": 0, "message": "Zu wenige Konzepte"}

    name_to_id = {c.name: c.id for c in concepts}
    types = db.query(RelationType).all()
    type_map = {t.name: t.id for t in types}

    # Typ-Beschreibungen
    type_desc = "\n".join(
        f"- {t.name} ({t.label_en}): {t.description or t.label_en}"
        for t in types
    )

    # Learning Loop: bestätigt + abgelehnt als Kontext
    confirmed = _get_confirmed_edges(db)
    rejected = _get_rejected_edges(db)

    confirmed_ctx = ""
    if confirmed:
        confirmed_ctx = (
            "\n\nACCEPTED relations (follow this pattern):\n"
            + json.dumps(confirmed[:20], ensure_ascii=False)
        )
    rejected_ctx = ""
    if rejected:
        rejected_ctx = (
            "\n\nREJECTED relations (DO NOT suggest similar ones):\n"
            + json.dumps(rejected[:20], ensure_ascii=False)
        )

    # Konzept-Liste (max 60 für Prompt-Länge)
    concept_list = "\n".join(
        f"- {c.name}" + (f": {c.description[:200]}" if c.description else "")
        for c in concepts[:60]
    )

    existing = _get_existing_pairs(db)
    rejected_pairs = _get_rejected_pairs(db)

    system = (
        "You are a knowledge representation expert. "
        "You analyze concepts and identify precise semantic relations. "
        "You learn from accepted and rejected examples. "
        "Respond ONLY in valid JSON."
    )

    prompt = f"""Analyze these concepts and find PRECISE typed relations:

CONCEPTS:
{concept_list}

RELATION TYPES (use the most specific type):
{type_desc}
{confirmed_ctx}
{rejected_ctx}

STRICT RULES:
1. Only suggest where content clearly supports the connection
2. Use MOST SPECIFIC type — avoid "related_to" unless nothing else fits
3. Do NOT repeat previously rejected patterns
4. Each reason must explain WHY these concepts are connected

Find 3-8 HIGH-CONFIDENCE relations. JSON format:
{{"relations": [{{"source": "concept_name", "target": "concept_name", "relation_type": "name", "reason": "Why connected"}}]}}"""

    raw = await _ollama_chat(prompt, system)
    suggestions = _parse_json(raw)

    created = 0
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        src_name = s.get("source", "").strip().lower()
        tgt_name = s.get("target", "").strip().lower()
        rel_type_name = s.get("relation_type", "related_to")
        reason = s.get("reason", "")

        src_id = name_to_id.get(src_name)
        tgt_id = name_to_id.get(tgt_name)
        if not src_id or not tgt_id or src_id == tgt_id:
            continue

        rt_id = type_map.get(rel_type_name, type_map.get("related_to"))
        if not rt_id:
            continue

        if (src_id, tgt_id) in existing:
            continue
        if (src_id, tgt_id) in rejected_pairs:
            logger.info(f"Übersprungen (rejected): {src_name} → {tgt_name}")
            continue

        db.add(ConceptEdge(
            source_concept_id=src_id,
            target_concept_id=tgt_id,
            relation_type_id=rt_id, strength=0.5,
            origin="ai_suggested", status="suggested",
            reason=reason,
        ))
        existing.add((src_id, tgt_id))
        created += 1

    db.commit()
    return {"suggested": created, "total_concepts": len(concepts)}
