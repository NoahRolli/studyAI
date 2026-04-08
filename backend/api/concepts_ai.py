# Konzept-Graph AI Service — Sync, Auto-Link
# Sync: Extrahiert Keywords aus Notes (Ollama) und Summaries (key_terms)
# Auto-Link: Gruppiert Konzepte nach Quelle, schlägt Edges vor
# Ollama-only — kein Claude, kein externer API-Call

import json
import re
import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource, ConceptEdge
from backend.models.note import Note
from backend.models.summary import Summary
from backend.infra.config import OLLAMA_MODEL
from backend.infra.ollama_connector import get_ollama_url

router = APIRouter(prefix="/api/concepts", tags=["concepts-ai"])

# Mapping: Ollama-String → relation_type_id (aus relation_types Tabelle)
RELATION_TYPE_MAP = {
    "related": 8, "related_to": 8,
    "builds_on": 4, "contradicts": 6,
    "part_of": 3, "is_a": 1,
    "subclass_of": 2, "requires": 5, "example_of": 7,
}


def _normalize_name(name: str) -> str:
    """Konzept-Name normalisieren: lowercase, trimmed."""
    return name.strip().lower()


def _parse_json_response(text_val: str) -> list | dict | None:
    """Ollama JSON-Antwort parsen (3-Strategie-Fallback)."""
    md_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text_val)
    if md_match:
        try:
            return json.loads(md_match.group(1).strip())
        except json.JSONDecodeError:
            pass
    json_match = re.search(r"(\[[\s\S]*?\]|\{[\s\S]*?\})", text_val)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text_val.strip())
    except json.JSONDecodeError:
        return None


async def _ollama_chat(prompt: str) -> str:
    """Einzelner Ollama-Chat-Call, gibt Text zurück."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{base_url}/api/chat", json={
            "model": OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False, "think": False,
        })
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


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
        ConceptSource.source_id == source_id,
    ).first()
    if not existing:
        db.add(ConceptSource(
            concept_id=concept.id, source_type=source_type,
            source_id=source_id, relevance=relevance,
        ))


async def _extract_keywords_ollama(content: str) -> list[str]:
    """Extrahiert 3-8 Konzepte aus Text via Ollama."""
    prompt = (
        "Extract 3 to 8 key academic or technical concepts from this text. "
        "Only return domain-specific terms, not generic words. "
        "Return ONLY a JSON array of lowercase strings.\n\n"
        f"Text: {content[:2000]}"
    )
    response = await _ollama_chat(prompt)
    parsed = _parse_json_response(response)
    if isinstance(parsed, list):
        return [str(k).strip().lower() for k in parsed
                if isinstance(k, str) and len(k.strip()) > 2]
    return []


async def _link_batch(db: Session, names: list[str],
                      name_to_id: dict) -> int:
    """Ollama analysiert Konzept-Gruppe und schlägt Edges vor."""
    if len(names) < 2:
        return 0
    prompt = (
        "These concepts are related to each other. "
        "Suggest pairs and their relation type: "
        "related, builds_on, contradicts, part_of, is_a, requires. "
        "Return ONLY a JSON array of objects with "
        "source, target, and relation fields.\n\n"
        f"Concepts: {json.dumps(names[:40])}"
    )
    response = await _ollama_chat(prompt)
    parsed = _parse_json_response(response)
    if not isinstance(parsed, list):
        return 0

    count = 0
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
        # Relation-String → relation_type_id
        rel_id = RELATION_TYPE_MAP.get(rel, 8)
        exists = db.query(ConceptEdge).filter(
            ConceptEdge.source_concept_id == name_to_id[src],
            ConceptEdge.target_concept_id == name_to_id[tgt],
        ).first()
        if not exists:
            db.add(ConceptEdge(
                source_concept_id=name_to_id[src],
                target_concept_id=name_to_id[tgt],
                relation_type_id=rel_id,
                strength=0.5,
                origin="ai_auto_link",
                status="suggested",
            ))
            count += 1
    return count


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
                _link_source(db, concept, "summary", s.id, 0.7)
                stats["new_links"] += 1
        stats["sources_scanned"] += 1

    # 2. Notes — Ollama-Extraction
    notes = db.query(Note).all()
    for note in notes:
        existing_links = db.query(ConceptSource).filter(
            ConceptSource.source_type == "note",
            ConceptSource.source_id == note.id,
        ).count()
        if existing_links > 0:
            continue
        content = f"{note.title}\n{note.content or ''}"
        keywords = await _extract_keywords_ollama(content)
        for kw in keywords:
            concept = _get_or_create_concept(db, kw)
            if concept:
                _link_source(db, concept, "note", note.id, 0.5)
                stats["new_links"] += 1
        stats["sources_scanned"] += 1

    stats["new_concepts"] = db.query(Concept).filter(
        Concept.embedding_stale == True
    ).count()
    db.commit()
    return stats


@router.post("/auto-link")
async def auto_link_concepts(db: Session = Depends(get_db)):
    """Gruppiert Konzepte nach Quelle und linkt per Batch."""
    concepts = db.query(Concept).all()
    if len(concepts) < 2:
        return {"suggestions": 0}

    name_to_id = {c.name: c.id for c in concepts}
    total = 0

    # Ko-Vorkommen: Konzepte die gleiche Quellen teilen
    rows = db.execute(text(
        "SELECT DISTINCT cs1.concept_id, cs2.concept_id "
        "FROM concept_sources cs1 "
        "JOIN concept_sources cs2 ON cs1.source_type = cs2.source_type "
        "AND cs1.source_id = cs2.source_id "
        "AND cs1.concept_id < cs2.concept_id"
    )).fetchall()

    groups: dict[int, set[int]] = {}
    for c1, c2 in rows:
        if c1 not in groups:
            groups[c1] = {c1}
        groups[c1].add(c2)

    processed = set()
    batches: list[list[str]] = []
    for seed, members in sorted(groups.items(), key=lambda x: -len(x[1])):
        batch_ids = members - processed
        if len(batch_ids) < 2:
            continue
        batch_names = []
        for cid in batch_ids:
            c = next((c for c in concepts if c.id == cid), None)
            if c:
                batch_names.append(c.name)
                processed.add(cid)
        if len(batch_names) >= 2:
            batches.append(batch_names)

    remaining = [c.name for c in concepts if c.id not in processed]
    for i in range(0, len(remaining), 30):
        chunk = remaining[i:i + 30]
        if len(chunk) >= 2:
            batches.append(chunk)

    for batch in batches:
        count = await _link_batch(db, batch, name_to_id)
        total += count

    db.commit()
    return {"suggestions": total, "batches": len(batches)}
