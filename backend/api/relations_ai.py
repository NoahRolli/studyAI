# Relations AI — Ollama-basierte Erkennung von Wissensrelationen
# Nutzt bestätigte + abgelehnte Relationen als Kontext (Learning Loop)
# Vorschläge werden mit Status 'suggested' + Begründung gespeichert

import json
import re
from backend.infra.config import OLLAMA_MODEL
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.infra.ollama_connector import get_ollama_url
from backend.models.relation import Relation, RelationType
from backend.models.note import Note
from backend.models.document import Document
from backend.models.summary import Summary
import httpx

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
    """JSON aus Ollama-Antwort extrahieren (Markdown/Raw Fallback)"""
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


def _get_all_nodes(db: Session) -> list[dict]:
    """Alle Notes + Summaries als Node-Dicts mit mehr Kontext"""
    nodes = []
    for note in db.query(Note).all():
        content = note.content or ""
        clean = re.sub(r'<[^>]+>', '', content)[:400]
        nodes.append({
            "type": "note", "id": note.id,
            "title": note.title, "content": clean,
        })
    for summary in db.query(Summary).all():
        doc = db.query(Document).filter(Document.id == summary.document_id).first()
        title = doc.filename if doc else f"Summary {summary.id}"
        content = (summary.content or "")[:400]
        nodes.append({
            "type": "summary", "id": summary.id,
            "title": title, "content": content,
        })
    return nodes


def _get_confirmed_relations(db: Session) -> list[dict]:
    """Bestätigte Relationen als Positivbeispiele"""
    rels = db.query(Relation).filter(Relation.status == "confirmed").all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    return [{
        "source": f"{r.source_type}:{r.source_id}",
        "target": f"{r.target_type}:{r.target_id}",
        "type": type_map.get(r.relation_type_id, "unknown"),
        "reason": r.reason or "",
    } for r in rels]


def _get_rejected_relations(db: Session) -> list[dict]:
    """Abgelehnte Relationen als Negativbeispiele"""
    rels = db.query(Relation).filter(Relation.status == "rejected").all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    return [{
        "source": f"{r.source_type}:{r.source_id}",
        "target": f"{r.target_type}:{r.target_id}",
        "type": type_map.get(r.relation_type_id, "unknown"),
    } for r in rels]


def _get_existing_pairs(db: Session) -> set:
    """Bereits vorhandene Paare (nicht-rejected)"""
    rels = db.query(Relation).filter(Relation.status != "rejected").all()
    pairs = set()
    for r in rels:
        pairs.add((r.source_type, r.source_id, r.target_type, r.target_id))
        pairs.add((r.target_type, r.target_id, r.source_type, r.source_id))
    return pairs


def _get_rejected_pairs(db: Session) -> set:
    """Abgelehnte Paare — nie wieder vorschlagen"""
    rels = db.query(Relation).filter(Relation.status == "rejected").all()
    pairs = set()
    for r in rels:
        pairs.add((r.source_type, r.source_id, r.target_type, r.target_id))
        pairs.add((r.target_type, r.target_id, r.source_type, r.source_id))
    return pairs


@router.post("/detect")
async def detect_relations(db: Session = Depends(get_db)):
    """Ollama analysiert Nodes und schlägt typisierte Relationen vor"""
    nodes = _get_all_nodes(db)
    if len(nodes) < 2:
        return {"suggested": 0, "message": "Zu wenige Nodes"}

    valid_keys = {f"{n['type']}:{n['id']}" for n in nodes}
    types = db.query(RelationType).all()
    type_map = {t.name: t.id for t in types}

    # Typ-Beschreibungen mit Beispielen
    type_desc = "\n".join(
        f"- {t.name} ({t.label_en}): {t.description or t.label_en}"
        for t in types
    )

    # Kontexte: bestätigt (Positiv) + abgelehnt (Negativ)
    confirmed = _get_confirmed_relations(db)
    rejected = _get_rejected_relations(db)

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

    # Node-Übersicht mit mehr Content
    node_list = "\n".join(
        f"- {n['type']}:{n['id']} \"{n['title']}\": {n['content'][:300]}"
        for n in nodes[:40]
    )

    existing = _get_existing_pairs(db)
    rejected_pairs = _get_rejected_pairs(db)

    system = (
        "You are a knowledge representation expert. "
        "You analyze knowledge nodes and identify precise semantic relations. "
        "You learn from accepted and rejected examples. "
        "Respond ONLY in valid JSON."
    )

    prompt = f"""Analyze these knowledge nodes and find PRECISE typed relations:

NODES:
{node_list}

RELATION TYPES (use the most specific type that fits):
{type_desc}
{confirmed_ctx}
{rejected_ctx}

STRICT RULES:
1. Only suggest relations where the content clearly supports the connection
2. Use the MOST SPECIFIC type — avoid "related_to" unless no other type fits
3. "part_of" means A is literally a component/section of B
4. "builds_on" means A requires understanding B first
5. "is_a" means A is an instance of category B
6. "contradicts" means A and B make opposing claims
7. Do NOT connect nodes just because they are in the same course/module
8. Do NOT repeat previously rejected patterns
9. Each reason must cite specific content from BOTH nodes

Find 2-5 HIGH-CONFIDENCE relations only. JSON format:
{{"relations": [{{"source": "type:id", "target": "type:id", "relation_type": "name", "reason": "Specific evidence from both nodes"}}]}}"""

    raw = await _ollama_chat(prompt, system)
    suggestions = _parse_json(raw)

    created = 0
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        source_ref = s.get("source", "")
        target_ref = s.get("target", "")
        rel_type_name = s.get("relation_type", "related_to")
        reason = s.get("reason", "")

        try:
            s_type, s_id = source_ref.split(":")
            t_type, t_id = target_ref.split(":")
            s_id, t_id = int(s_id), int(t_id)
        except (ValueError, AttributeError):
            continue

        rt_id = type_map.get(rel_type_name, type_map.get("related_to"))
        if not rt_id:
            continue

        # Duplikat-Check (bestehende + rejected Paare)
        if (s_type, s_id, t_type, t_id) in existing:
            continue
        if (s_type, s_id, t_type, t_id) in rejected_pairs:
            logger.info(f"Übersprungen (rejected): {source_ref} → {target_ref}")
            continue

        # Validierung: Node-Existenz + keine Selbstreferenz
        if f"{s_type}:{s_id}" not in valid_keys:
            continue
        if f"{t_type}:{t_id}" not in valid_keys:
            continue
        if s_type == t_type and s_id == t_id:
            continue

        db.add(Relation(
            source_type=s_type, source_id=s_id,
            target_type=t_type, target_id=t_id,
            relation_type_id=rt_id, status="suggested",
            reason=reason, created_by="ollama",
        ))
        existing.add((s_type, s_id, t_type, t_id))
        created += 1

    db.commit()
    return {"suggested": created, "total_nodes": len(nodes)}
