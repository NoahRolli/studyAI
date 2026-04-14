# Relations AI — Erkennung von Wissensrelationen via aktivem Provider
# Nutzt bestätigte + abgelehnte concept_edges als Kontext (Learning Loop)
# Vorschläge werden als concept_edges mit origin='ai_suggested' gespeichert
# Quell-Kontext: Konzepte erhalten ihre Quell-Dokumente im Prompt


import json
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge, ConceptSource
from backend.models.relation import RelationType
from backend.models.summary import Summary
from backend.models.note import Note
from backend.api.concepts_ai import ai_chat, parse_json_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/relations", tags=["relations-ai"])


def _get_confirmed_edges(db: Session) -> list[dict]:
    """Bestätigte Edges als Positivbeispiele für Learning Loop"""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status == "confirmed"
    ).all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    concept_map = {c.id: c.name for c in db.query(Concept).all()}
    return [
        {"source": concept_map.get(e.source_concept_id, "?"),
         "target": concept_map.get(e.target_concept_id, "?"),
         "type": type_map.get(e.relation_type_id, "?")}
        for e in edges[:20]
    ]


def _get_rejected_edges(db: Session) -> list[dict]:
    """Abgelehnte Edges als Negativbeispiele"""
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status == "rejected"
    ).all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    concept_map = {c.id: c.name for c in db.query(Concept).all()}
    return [
        {"source": concept_map.get(e.source_concept_id, "?"),
         "target": concept_map.get(e.target_concept_id, "?"),
         "type": type_map.get(e.relation_type_id, "?")}
        for e in edges[:20]
    ]


def _get_existing_pairs(db: Session) -> set:
    """Alle nicht-abgelehnten Paare — nicht doppelt vorschlagen"""
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


def _build_concept_context(concepts: list, db: Session) -> str:
    """Baut Konzept-Liste mit Quellen für den AI-Prompt."""
    lines = []
    for c in concepts[:60]:
        sources = db.query(ConceptSource).filter(
            ConceptSource.concept_id == c.id
        ).all()
        src_parts = []
        for s in sources[:3]:
            if s.source_type == "note":
                note = db.query(Note).filter(Note.id == s.source_id).first()
                if note:
                    src_parts.append(f"Note: {note.title}")
            elif s.source_type == "summary":
                summary = db.query(Summary).filter(Summary.id == s.source_id).first()
                if summary:
                    src_parts.append(f"Summary: {summary.title or f'#{s.source_id}'}")
        desc = f": {c.description[:150]}" if c.description else ""
        src_info = f" [aus: {', '.join(src_parts)}]" if src_parts else ""
        lines.append(f"- {c.name}{desc}{src_info}")
    return "\n".join(lines)


def _parse_relations(raw: str) -> list:
    """JSON-Array aus AI-Antwort extrahieren."""
    parsed = parse_json_response(raw)
    if isinstance(parsed, dict) and "relations" in parsed:
        return parsed["relations"]
    if isinstance(parsed, list):
        return parsed
    return []


@router.post("/detect")
async def detect_relations(db: Session = Depends(get_db)):
    """AI analysiert Konzepte und schlägt typisierte Edges vor."""
    concepts = db.query(Concept).all()
    if len(concepts) < 2:
        return {"suggested": 0, "message": "Zu wenige Konzepte"}

    name_to_id = {c.name: c.id for c in concepts}
    types = db.query(RelationType).all()
    type_map = {t.name: t.id for t in types}
    type_desc = "\n".join(
        f"- {t.name} ({t.label_en}): {t.description or t.label_en}"
        for t in types
    )

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

    concept_list = _build_concept_context(concepts, db)
    existing = _get_existing_pairs(db)
    rejected_pairs = _get_rejected_pairs(db)

    prompt = f"""You are a knowledge representation expert.
You analyze concepts and identify precise semantic relations.
You learn from accepted and rejected examples.
Each concept includes its source documents in [brackets].

Analyze these concepts and find PRECISE typed relations:

CONCEPTS (with sources):
{concept_list}

RELATION TYPES (use the most specific type):
{type_desc}
{confirmed_ctx}
{rejected_ctx}

STRICT RULES:
1. Only suggest where content clearly supports the connection
2. Use MOST SPECIFIC type — avoid "related_to" unless nothing else fits
3. Do NOT repeat previously rejected patterns
4. reason must be 2-3 sentences explaining the specific connection
5. Reference the source documents when possible
6. Explain what aspect of concept A relates to concept B

Find 3-8 HIGH-CONFIDENCE relations. Respond ONLY in valid JSON:
{{"relations": [{{"source": "concept_name", "target": "concept_name", "relation_type": "name", "reason": "Detailed 2-3 sentence explanation referencing sources"}}]}}"""

    raw = await ai_chat(prompt, page="ontology")
    suggestions = _parse_relations(raw)

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
            source_concept_id=src_id, target_concept_id=tgt_id,
            relation_type_id=rt_id, strength=0.5,
            origin="ai_suggested", status="suggested",
            reason=reason,
        ))
        existing.add((src_id, tgt_id))
        created += 1

    db.commit()
    return {"suggested": created, "total_concepts": len(concepts)}

