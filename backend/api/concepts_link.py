# Konzept-Graph AI Service — Auto-Link + Batch-Linking
# Gruppiert Konzepte nach Ko-Vorkommen, schlägt Edges vor (mit Reason)
# Ollama-only — kein Claude, kein externer API-Call

import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge
from backend.api.concepts_ai import (
    normalize_name, parse_json_response, ollama_chat,
)

router = APIRouter(prefix="/api/concepts", tags=["concepts-link"])

# Mapping: Ollama-String → relation_type_id (aus relation_types Tabelle)
RELATION_TYPE_MAP = {
    "related": 8, "related_to": 8,
    "builds_on": 4, "contradicts": 6,
    "part_of": 3, "is_a": 1,
    "subclass_of": 2, "requires": 5, "example_of": 7,
}


async def _link_batch(db: Session, names: list[str],
                      name_to_id: dict) -> int:
    """Ollama analysiert Konzept-Gruppe und schlägt Edges vor."""
    if len(names) < 2:
        return 0
    prompt = (
        "These concepts appear together in study documents. "
        "Suggest meaningful pairs and their relation type: "
        "related, builds_on, contradicts, part_of, is_a, requires.\n"
        "For each pair, explain WHY they are connected (5-10 words).\n"
        "Return ONLY a JSON array of objects with "
        "source, target, relation, and reason fields.\n\n"
        "Example: [{\"source\": \"neural network\", "
        "\"target\": \"backpropagation\", "
        "\"relation\": \"requires\", "
        "\"reason\": \"training algorithm for weight updates\"}]\n\n"
        f"Concepts: {json.dumps(names[:40])}"
    )
    response = await ollama_chat(prompt)
    parsed = parse_json_response(response)
    if not isinstance(parsed, list):
        return 0

    count = 0
    for item in parsed:
        if not isinstance(item, dict):
            continue
        src = normalize_name(item.get("source", ""))
        tgt = normalize_name(item.get("target", ""))
        rel = item.get("relation", "related")
        reason = item.get("reason", "")
        if src not in name_to_id or tgt not in name_to_id:
            continue
        if src == tgt:
            continue
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
                reason=str(reason)[:200] if reason else None,
            ))
            count += 1
    return count


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
    for seed, members in sorted(
        groups.items(), key=lambda x: -len(x[1])
    ):
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

    # Übrige Konzepte in 30er-Gruppen
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
