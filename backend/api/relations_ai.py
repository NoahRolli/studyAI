# Relations AI — Ollama-basierte Erkennung von Wissensrelationen
# Nutzt bestätigte Relationen als Kontext (lernt von User-Entscheidungen)
# Vorschläge werden mit Status 'suggested' + Begründung gespeichert

import json
from backend.infra.config import OLLAMA_MODEL
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.infra.ollama_connector import get_ollama_url
from backend.models.relation import Relation, RelationType
from backend.models.note import Note
from backend.models.module import Module
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
                "stream": False, "format": "json",
                "think": False,
            })
            data = resp.json()
            return data.get("message", {}).get("content", "")
    except Exception as e:
        logger.error(f"Ollama Chat-Fehler: {e}")
        return ""


def _parse_json(text: str) -> list:
    """JSON aus Ollama-Antwort extrahieren (Markdown/Raw Fallback)"""
    cleaned = text.strip()
    # Markdown Codeblock entfernen
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
    """Alle Notes + Summaries als Node-Dicts laden"""
    nodes = []
    # Notes laden
    for note in db.query(Note).all():
        content = note.content or ""
        # HTML-Tags grob entfernen für Ollama
        import re
        clean = re.sub(r'<[^>]+>', '', content)[:500]
        nodes.append({
            "type": "note", "id": note.id,
            "title": note.title, "content": clean,
        })
    # Summaries laden (über Document für Titel)
    for summary in db.query(Summary).all():
        doc = db.query(Document).filter(Document.id == summary.document_id).first()
        title = doc.filename if doc else f"Summary {summary.id}"
        content = (summary.content or "")[:500]
        nodes.append({
            "type": "summary", "id": summary.id,
            "title": title, "content": content,
        })
    return nodes


def _get_confirmed_relations(db: Session) -> list[dict]:
    """Bestätigte Relationen als Kontext für Ollama"""
    rels = db.query(Relation).filter(Relation.status == "confirmed").all()
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    return [
        {
            "source": f"{r.source_type}:{r.source_id}",
            "target": f"{r.target_type}:{r.target_id}",
            "type": type_map.get(r.relation_type_id, "unknown"),
            "reason": r.reason or "",
        }
        for r in rels
    ]


def _get_existing_pairs(db: Session) -> set:
    """Bereits vorhandene Paare (unabhängig von Status)"""
    rels = db.query(Relation).filter(Relation.status != "rejected").all()
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
        return {"suggested": 0, "message": "Zu wenige Nodes für Analyse"}


    # Gültige Node-Keys für Validierung (verhindert Ollama-Halluzinationen)
    valid_keys = {f"{n['type']}:{n['id']}" for n in nodes}
    # Relationstypen laden
    types = db.query(RelationType).all()
    type_map = {t.name: t.id for t in types}
    type_descriptions = "\n".join(
        f"- {t.name}: {t.description or t.label_en}" for t in types
    )

    # Bestätigte Relationen als Kontext
    confirmed = _get_confirmed_relations(db)
    confirmed_ctx = ""
    if confirmed:
        confirmed_ctx = (
            "\n\nBereits bestätigte Relationen (konsistent weiterarbeiten):\n"
            + json.dumps(confirmed[:30], ensure_ascii=False)
        )

    # Node-Übersicht für Prompt
    node_list = "\n".join(
        f"- {n['type']}:{n['id']} \"{n['title']}\": {n['content'][:200]}"
        for n in nodes[:40]
    )

    existing = _get_existing_pairs(db)

    system = (
        "Du bist ein Wissensrepräsentations-Experte. "
        "Analysiere die gegebenen Wissens-Nodes und erkenne "
        "semantische Relationen zwischen ihnen. "
        "Antworte ausschliesslich in JSON."
    )

    prompt = f"""Analysiere diese Wissens-Nodes und finde typisierte Relationen:

NODES:
{node_list}

VERFÜGBARE RELATIONSTYPEN:
{type_descriptions}
{confirmed_ctx}

Finde 3-10 sinnvolle Relationen. Für jede Relation:
- source: "type:id" (z.B. "note:5")
- target: "type:id"
- relation_type: Name aus der Liste oben
- reason: Kurze Begründung WARUM diese Verbindung besteht (1-2 Sätze)

Antworte als JSON: {{"relations": [...]}}
Nur Relationen mit klarer Begründung. Qualität vor Quantität."""

    raw = await _ollama_chat(prompt, system)
    suggestions = _parse_json(raw)

    # Vorschläge filtern und speichern
    created = 0
    for s in suggestions:
        if not isinstance(s, dict):
            continue
        source_ref = s.get("source", "")
        target_ref = s.get("target", "")
        rel_type_name = s.get("relation_type", "related_to")
        reason = s.get("reason", "")

        # Referenzen parsen (format: "type:id")
        try:
            s_type, s_id = source_ref.split(":")
            t_type, t_id = target_ref.split(":")
            s_id, t_id = int(s_id), int(t_id)
        except (ValueError, AttributeError):
            continue

        # Typ validieren
        rt_id = type_map.get(rel_type_name, type_map.get("related_to"))
        if not rt_id:
            continue

        # Duplikat-Check
        if (s_type, s_id, t_type, t_id) in existing:
            continue

        # Node-Existenz validieren (keine halluzierten IDs)
        if f"{s_type}:{s_id}" not in valid_keys or f"{t_type}:{t_id}" not in valid_keys:
            continue
        # Selbstreferenz verhindern
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
