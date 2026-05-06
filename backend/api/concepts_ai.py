# Konzept-Graph AI Service — Sync + Keyword-Extraction
import logging
# Sync: Extrahiert Keywords aus Notes und Summaries (key_terms)
# Nur Dokumente aus Ordnern mit metis_enabled=True werden gescannt
# Nutzt den aktiven Provider (Groq/Ollama) via model_router

import asyncio
import json
import os
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
from backend.infra.ollama_connector import (
    get_ollama_url, invalidate_cache, report_failure, report_success,
)
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
    """Zentraler AI-Chat — Wrapper um ai_chat_with_provider."""
    text, _ = await ai_chat_with_provider(prompt, page)
    return text



async def ai_chat_with_provider(prompt: str, page: str = "metis", disable_groq: bool = False) -> tuple[str, str]:
    """Wie ai_chat, gibt aber (text, provider_name) Tuple zurueck."""
    provider = get_active_provider(page)

    # Optional Groq-Bypass via Env (für CLI-Scripts ohne Rate-Limit-Schleifen)
    if (os.getenv("PALLAS_DISABLE_GROQ") == "1" or disable_groq) and provider == "groq":
        logging.getLogger(__name__).info(
            "Groq disabled (env or disable_groq=True) — direkt Ollama"
        )
        provider = "ollama_local"

    used = provider
    if provider == "groq":
        try:
            result = await _groq.chat(prompt)
            return result, "groq"
        except GroqRateLimitError:
            logging.getLogger(__name__).warning("Groq 429 — Fallback auf Ollama")
    # Ollama Fallback
    if provider == "groq":
        model = OLLAMA_MODEL
        used = "ollama_local"
    else:
        model = OLLAMA_MODEL if provider == "ollama_local" else OLLAMA_MODEL_SERVER
        used = provider
    # Retry-Loop: 3 Versuche mit Backoff (0s, 2s, 4s)
    # Bei Failure: report_failure() → URL geht nach N Fails in Cooldown
    # Bei Success: report_success() → Failure-Counter resetten
    last_exc: Exception | None = None
    for attempt in range(3):
        base_url = await get_ollama_url()
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=5.0, read=90.0, write=10.0, pool=10.0)
            ) as client:
                resp = await client.post(f"{base_url}/api/chat", json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False, "think": False,
                })
                resp.raise_for_status()
                text = resp.json().get("message", {}).get("content", "")
                report_success(base_url)
                return text, f"{used}:{model}"
        except Exception as e:
            last_exc = e
            logging.getLogger(__name__).warning(
                f"Ollama Fehler auf {base_url} (attempt {attempt + 1}/3): "
                f"{type(e).__name__}: {e!r}"
            )
            report_failure(base_url)
            invalidate_cache()
            if attempt < 2:
                await asyncio.sleep(2.0 * (attempt + 1))
                continue
            raise
    if last_exc:
        raise last_exc


# Alias für Abwärtskompatibilität (concepts_cluster.py importiert diesen Namen)
async def ollama_chat(prompt: str) -> str:
    """Legacy-Wrapper — nutzt jetzt ai_chat mit Routing."""
    return await ai_chat(prompt)


# Cache fuer Cluster-Labels (lowercase frozenset).
# Verhindert Phantom-Concepts wo der Concept-Name exakt einem Cluster-Label
# entspricht (entstehen wenn LLM-Chats ueber Cluster-Labels selbst diskutieren
# und dann durch die Concept-Extraction laufen). Cache lebt pro Worker-Prozess
# und wird beim naechsten Group-Topics-Run automatisch refreshed.
_CLUSTER_LABEL_CACHE: frozenset[str] | None = None


def _get_cluster_labels(db: Session) -> frozenset[str]:
    """Alle Cluster-Labels lowercase als Set (memoized)."""
    global _CLUSTER_LABEL_CACHE
    if _CLUSTER_LABEL_CACHE is None:
        from backend.models.concept import ConceptCluster
        rows = db.query(ConceptCluster.label).all()
        _CLUSTER_LABEL_CACHE = frozenset(
            row[0].lower() for row in rows if row[0]
        )
        logging.getLogger(__name__).info(
            f"Cluster-Label-Cache geladen: {len(_CLUSTER_LABEL_CACHE)} Labels"
        )
    return _CLUSTER_LABEL_CACHE


def invalidate_cluster_label_cache() -> None:
    """Nach Group-Topics-Run aufrufen damit neue Labels gefiltert werden."""
    global _CLUSTER_LABEL_CACHE
    _CLUSTER_LABEL_CACHE = None


def get_or_create_concept(db: Session, name: str) -> Concept:
    """Konzept holen oder neu erstellen (normalisiert).

    Lehnt Phantom-Concepts ab deren Name einem Cluster-Label entspricht
    (vermeidet self-referential Loops in der Cluster-Pipeline).
    """
    normalized = normalize_name(name)
    if not normalized:
        return None
    # Filter: Phantom-Concept (Cluster-Label-Echo)?
    if normalized.lower() in _get_cluster_labels(db):
        logging.getLogger(__name__).info(
            f"Phantom-Concept abgelehnt (matcht Cluster-Label): {normalized!r}"
        )
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
