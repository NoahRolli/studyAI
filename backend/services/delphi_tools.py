"""
Delphi Tools — Aggregat-Operationen die ueber RAG hinausgehen.

Architektur:
- Reine Funktionen mit (db, *args) Signatur. Tools sind testbar ohne
  Provider-Stack.
- Returnen Strings (kein dict) — der LLM liest das direkt als Tool-Result.
- Logik nutzt das gleiche Embedding-Search wie delphi_retrieval, aber
  zieht zusaetzlich auf created_at fuer Zeit-Aggregationen.

Vermieden in V1:
- Git-Daten (separate Tabelle, gehoert ins B-Track)
- Journal-Daten (separate DB, andere Auth)
- Aenderungen an concept_sources Schema

JSON-Schemas am Ende des Files definieren was der LLM sieht.
ID-Felder, db-Sessions etc. sind im Schema NICHT enthalten — die
werden im Provider-Loop injiziert.
"""

import logging
import asyncio
import numpy as np
from datetime import datetime
from sqlalchemy.orm import Session

from backend.models.concept import ConceptSource
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.llm import LLMMessage
from backend.services.embedding_service import generate_embedding
from backend.services.delphi_retrieval_cache import get_embedding_cache

logger = logging.getLogger(__name__)


# ---------- Konfig ----------
TIMELINE_TOP_K_CONCEPTS = 30   # Mehr als bei Standard-Retrieval — wir
                                # wollen Spannweite, nicht Praezision
TIMELINE_MAX_SOURCES = 200      # Kappung damit Aggregation schnell bleibt


# ---------- Helper: Source-Date-Lookup ----------
def _fetch_created_at(
    db: Session,
    source_type: str,
    source_ids: list[int],
) -> dict[int, datetime]:
    """Bulk-Lookup: source_id -> created_at fuer eine Source-Tabelle.

    Bulk statt Schleife weil wir bis zu TIMELINE_MAX_SOURCES Eintraege
    haben — eine SQL-Query statt 200 ist wesentlich schneller.
    """
    if not source_ids:
        return {}

    if source_type == "note":
        rows = db.query(Note.id, Note.created_at).filter(
            Note.id.in_(source_ids)
        ).all()
    elif source_type == "summary":
        rows = db.query(Summary.id, Summary.created_at).filter(
            Summary.id.in_(source_ids)
        ).all()
    elif source_type == "chat_message":
        rows = db.query(LLMMessage.id, LLMMessage.created_at).filter(
            LLMMessage.id.in_(source_ids)
        ).all()
    else:
        return {}

    return {r[0]: r[1] for r in rows if r[1] is not None}


# ---------- Helper: Topic -> Source-Liste mit Daten ----------
async def _gather_sources_for_topic(
    db: Session,
    topic: str,
) -> list[tuple[str, int, datetime, str]]:
    """Findet Sources zu einem Topic via Concept-Embedding-Search.

    Returns Liste von (source_type, source_id, created_at, title).
    Sortiert nach created_at aufsteigend.
    """
    # 1) Topic-Embedding
    query_vec = await generate_embedding(topic)
    q = np.asarray(query_vec, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm < 1e-9:
        return []
    q = q / q_norm

    # 2) Top-K Concepts via Cache
    matrix, ids, _names = await get_embedding_cache(db)
    if matrix.shape[0] == 0:
        return []
    scores = matrix @ q
    k = min(TIMELINE_TOP_K_CONCEPTS, scores.shape[0])
    top_idx = np.argpartition(-scores, k - 1)[:k]
    top_concept_ids = ids[top_idx].tolist()

    # 3) Concept -> Sources
    rows = (
        db.query(ConceptSource.source_type, ConceptSource.source_id)
        .filter(ConceptSource.concept_id.in_(top_concept_ids))
        .distinct()
        .limit(TIMELINE_MAX_SOURCES)
        .all()
    )

    # 4) Bulk-Date-Lookup pro Source-Type
    by_type: dict[str, list[int]] = {}
    for stype, sid in rows:
        by_type.setdefault(stype, []).append(sid)

    dates_by_type: dict[str, dict[int, datetime]] = {}
    for stype, sids in by_type.items():
        dates_by_type[stype] = _fetch_created_at(db, stype, sids)

    # 5) Liste zusammenbauen
    out: list[tuple[str, int, datetime, str]] = []
    for stype, sid in rows:
        created = dates_by_type.get(stype, {}).get(sid)
        if created is None:
            continue
        out.append((stype, sid, created, ""))  # title leer, brauchen wir nur in list_oldest

    out.sort(key=lambda x: x[2])
    return out


# ---------- Tool 1: get_topic_timeline ----------
async def get_topic_timeline(db: Session, topic: str) -> str:
    """Findet wann ueber ein Topic erstmals/letztmals geschrieben wurde."""
    sources = await _gather_sources_for_topic(db, topic)
    if not sources:
        return f"Keine Quellen zum Thema '{topic}' gefunden."

    earliest = sources[0][2]
    latest = sources[-1][2]
    span_days = (latest - earliest).days

    by_type: dict[str, int] = {}
    for stype, _, _, _ in sources:
        by_type[stype] = by_type.get(stype, 0) + 1

    type_summary = ", ".join(
        f"{n} {t}" for t, n in sorted(by_type.items(), key=lambda x: -x[1])
    )

    return (
        f"Thema '{topic}': {len(sources)} Quellen ({type_summary}). "
        f"Frueheste Erwaehnung: {earliest.strftime('%Y-%m-%d')}. "
        f"Letzte Erwaehnung: {latest.strftime('%Y-%m-%d')}. "
        f"Spanne: {span_days} Tage."
    )


# ---------- Tool 2: count_sources_per_period ----------
async def count_sources_per_period(
    db: Session,
    start_date: str,
    end_date: str,
    source_type: str | None = None,
) -> str:
    """Zaehlt Notes/Summaries/Chats in einem Zeitraum."""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        return f"Ungueltiges Datumsformat. Erwartet YYYY-MM-DD, erhalten start={start_date}, end={end_date}."

    if start > end:
        return f"start_date ({start_date}) liegt nach end_date ({end_date})."

    counts: dict[str, int] = {}
    types_to_check = [source_type] if source_type else ["note", "summary", "chat_message"]

    for stype in types_to_check:
        if stype == "note":
            n = db.query(Note).filter(
                Note.created_at >= start, Note.created_at <= end
            ).count()
        elif stype == "summary":
            n = db.query(Summary).filter(
                Summary.created_at >= start, Summary.created_at <= end
            ).count()
        elif stype == "chat_message":
            n = db.query(LLMMessage).filter(
                LLMMessage.created_at >= start, LLMMessage.created_at <= end
            ).count()
        else:
            return f"Unbekannter source_type: {stype}. Erlaubt: note, summary, chat_message."
        counts[stype] = n

    if source_type:
        return f"{counts[source_type]} {source_type}-Eintraege zwischen {start_date} und {end_date}."

    parts = [f"{n} {t}" for t, n in counts.items()]
    total = sum(counts.values())
    return f"Zwischen {start_date} und {end_date}: {total} Eintraege gesamt ({', '.join(parts)})."


# ---------- Tool 3: list_oldest_sources ----------
async def list_oldest_sources(
    db: Session,
    topic: str,
    limit: int = 5,
) -> str:
    """Listet die aeltesten N Sources zu einem Topic."""
    limit = max(1, min(limit, 20))  # Clamp
    sources = await _gather_sources_for_topic(db, topic)
    if not sources:
        return f"Keine Quellen zum Thema '{topic}' gefunden."

    # Title nachladen fuer die Top-N
    oldest = sources[:limit]

    # Bulk-Title-Lookup pro Source-Type
    by_type: dict[str, list[int]] = {}
    for stype, sid, _, _ in oldest:
        by_type.setdefault(stype, []).append(sid)

    titles: dict[tuple[str, int], str] = {}
    for stype, sids in by_type.items():
        if stype == "note":
            for nid, ntitle in db.query(Note.id, Note.title).filter(Note.id.in_(sids)).all():
                titles[("note", nid)] = ntitle or "(unbenannte Notiz)"
        elif stype == "summary":
            for sid_, stitle in db.query(Summary.id, Summary.title).filter(Summary.id.in_(sids)).all():
                titles[("summary", sid_)] = stitle or f"Summary #{sid_}"
        elif stype == "chat_message":
            from backend.models.llm import LLMConversation
            msgs = db.query(LLMMessage.id, LLMMessage.conversation_id, LLMMessage.turn_index, LLMMessage.role).filter(
                LLMMessage.id.in_(sids)
            ).all()
            conv_ids = list({m[1] for m in msgs})
            convs = dict(db.query(LLMConversation.id, LLMConversation.title).filter(
                LLMConversation.id.in_(conv_ids)
            ).all())
            for mid, cid, turn, role in msgs:
                ctitle = (convs.get(cid) or "Untitled")[:60]
                titles[("chat_message", mid)] = f"{ctitle} (Turn {turn}, {role})"

    lines = [f"Aelteste {len(oldest)} Quellen zu '{topic}':"]
    for stype, sid, created, _ in oldest:
        title = titles.get((stype, sid), f"#{sid}")
        lines.append(f"- {created.strftime('%Y-%m-%d')} [{stype}] {title}")

    return "\n".join(lines)


# ---------- Tool-Dispatcher ----------
async def execute_tool(name: str, args: dict, db: Session) -> str:
    """Fuehrt ein Tool aus. Returnt String fuers LLM (nie raise)."""
    try:
        if name == "get_topic_timeline":
            return await get_topic_timeline(db, **args)
        if name == "count_sources_per_period":
            return await count_sources_per_period(db, **args)
        if name == "list_oldest_sources":
            return await list_oldest_sources(db, **args)
        return f"Unbekanntes Werkzeug: {name}"
    except Exception as e:
        logger.exception(f"Tool {name} failed")
        return f"Fehler beim Ausfuehren von {name}: {type(e).__name__}: {e}"
