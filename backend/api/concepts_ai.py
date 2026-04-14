# Konzept-Graph AI Service — Sync + Keyword-Extraction
import logging
# Sync: Extrahiert Keywords aus Notes und Summaries (key_terms)
# Nur Dokumente aus Ordnern mit metis_enabled=True werden gescannt
# Nutzt den aktiven Provider (Groq/Ollama) via model_router

import json
import re
import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module
from backend.models.folder import Folder
from backend.infra.config import OLLAMA_MODEL, OLLAMA_MODEL_SERVER
from backend.infra.ollama_connector import get_ollama_url, invalidate_cache
from backend.infra.model_router import get_active_provider, get_model_used
from backend.services.groq_provider import GroqProvider, GroqRateLimitError

router = APIRouter(prefix="/api/concepts", tags=["concepts-ai"])

# Groq-Instanz (wiederverwendbar)
_groq = GroqProvider()


def normalize_name(name: str) -> str:
    """Konzept-Name normalisieren: lowercase, trimmed."""
    return name.strip().lower()


def parse_json_response(text_val: str) -> list | dict | None:
    """JSON-Antwort parsen (3-Strategie-Fallback)."""
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


async def ai_chat(prompt: str, page: str = "metis") -> str:
    """Zentraler AI-Chat — routet zum aktiven Provider. Groq 429 → Ollama Fallback."""
    provider = get_active_provider(page)
    if provider == "groq":
        try:
            return await _groq.chat(prompt)
        except GroqRateLimitError:

            logging.getLogger(__name__).warning("Groq 429 in concepts_ai — Fallback auf Ollama")
            # Fallthrough zu Ollama
    # Ollama (local oder server, oder Fallback nach Groq 429)
    # Retry mit Cache-Invalidierung bei Fehler (z.B. falsches Modell auf MacBook)
    model = OLLAMA_MODEL if provider == "ollama_local" else OLLAMA_MODEL_SERVER
    for attempt in range(2):
        base_url = await get_ollama_url()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(f"{base_url}/api/chat", json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False, "think": False,
                })
                resp.raise_for_status()
                return resp.json().get("message", {}).get("content", "")
        except Exception as e:
            if attempt == 0:
                logging.getLogger(__name__).warning(f"Ollama Fehler auf {base_url}: {e} — Cache invalidieren + Retry")
                invalidate_cache()
                continue
            raise

# Alias für Abwärtskompatibilität (concepts_cluster.py importiert diesen Namen)
async def ollama_chat(prompt: str) -> str:
    """Legacy-Wrapper — nutzt jetzt ai_chat mit Routing."""
    return await ai_chat(prompt)


def get_or_create_concept(db: Session, name: str) -> Concept:
    """Konzept holen oder neu erstellen (normalisiert)."""
    normalized = normalize_name(name)
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


def link_source(db: Session, concept: Concept,
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


async def extract_keywords_ollama(content: str) -> list[str]:
    """Extrahiert 3-8 fachliche Konzepte aus Text via aktivem Provider."""
    prompt = (
        "Extract 3 to 8 key concepts from this text.\n\n"
        "RULES:\n"
        "- Only domain-specific nouns or noun phrases "
        "(e.g. 'machine learning', 'knowledge graph', 'OAuth 2.0', "
        "'Fuzzy Logic', 'Ontologie', 'Wissensrepräsentation')\n"
        "- NO generic words: test, example, system, data, function, "
        "method, process, node, graph, file, code, type, value, "
        "list, table, result, input, output, error, object, class, "
        "module, component, page, button, text, name, title, content, "
        "format, structure, model, database, server, client, user, "
        "application, interface, feature, tool, option, setting, "
        "version, update, change, problem, solution, approach\n"
        "- NO verbs or adjectives\n"
        "- NO single characters, IDs, variable names, or file paths\n"
        "- German academic terms are welcome\n"
        "- Prefer established terminology over invented phrases\n"
        "Return ONLY a JSON array of lowercase strings.\n\n"
        f"Text: {content[:2000]}"
    )
    response = await ai_chat(prompt)
    parsed = parse_json_response(response)
    if isinstance(parsed, list):
        return [str(k).strip().lower() for k in parsed
                if isinstance(k, str) and 2 < len(k.strip()) < 80]
    return []


def _get_enabled_folder_ids(db: Session) -> set[int]:
    """IDs aller Ordner mit metis_enabled=True."""
    rows = db.query(Folder.id).filter(Folder.metis_enabled == True).all()
    return {r[0] for r in rows}


def _get_enabled_summary_ids(db: Session,
                             folder_ids: set[int]) -> set[int]:
    """Summary-IDs deren Dokumente in aktivierten Ordnern liegen."""
    if not folder_ids:
        return set()
    direct = db.query(Document.id).filter(
        Document.folder_id.in_(folder_ids)
    ).all()
    via_module = db.query(Document.id).join(
        Module, Document.module_id == Module.id
    ).filter(Module.folder_id.in_(folder_ids)).all()
    doc_ids = {r[0] for r in direct} | {r[0] for r in via_module}
    if not doc_ids:
        return set()
    rows = db.query(Summary.id).filter(
        Summary.document_id.in_(doc_ids)
    ).all()
    return {r[0] for r in rows}


@router.post("/sync")
async def sync_concepts(
    db: Session = Depends(get_db),
    force: bool = Query(
        False, description="Re-scan auch bereits verknüpfte Notes"
    ),
):
    """Scannt Notes + Summaries aus aktivierten Ordnern."""
    stats = {"new_concepts": 0, "new_links": 0,
             "sources_scanned": 0, "skipped_disabled": 0,
             "model_used": get_model_used(page="metis")}

    folder_ids = _get_enabled_folder_ids(db)
    enabled_sids = _get_enabled_summary_ids(db, folder_ids)

    # 1. Summaries — nur aus aktivierten Ordnern
    summaries = db.query(Summary).all()
    for s in summaries:
        if s.id not in enabled_sids:
            stats["skipped_disabled"] += 1
            continue
        terms = s.key_terms or []
        if isinstance(terms, str):
            try:
                terms = json.loads(terms)
            except json.JSONDecodeError:
                terms = []
        for term in terms:
            if not isinstance(term, str) or not term.strip():
                continue
            concept = get_or_create_concept(db, term)
            if concept:
                link_source(db, concept, "summary", s.id, 0.7)
                stats["new_links"] += 1
        stats["sources_scanned"] += 1

    # 2. Notes — immer scannen (ordnerunabhängig)
    notes = db.query(Note).all()
    for note in notes:
        if not force:
            existing_links = db.query(ConceptSource).filter(
                ConceptSource.source_type == "note",
                ConceptSource.source_id == note.id,
            ).count()
            if existing_links > 0:
                continue
        content = f"{note.title}\n{note.content or ''}"
        keywords = await extract_keywords_ollama(content)
        for kw in keywords:
            concept = get_or_create_concept(db, kw)
            if concept:
                link_source(db, concept, "note", note.id, 0.5)
                stats["new_links"] += 1
        stats["sources_scanned"] += 1

    stats["new_concepts"] = db.query(Concept).filter(
        Concept.embedding_stale == True
    ).count()
    db.commit()
    return stats
