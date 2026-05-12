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
from datetime import datetime
from sqlalchemy.orm import Session

import backend.models.registry  # noqa: F401  Lazy-loads ALLE Models.
                                  # Vermeidet "Document not found"-Errors
                                  # bei Cross-Model-Relationships.

from backend.models.concept import ConceptSource
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.llm import LLMMessage
from backend.services.delphi_tools_anchor import _resolve_topic_anchor
from backend.services.delphi_tools_output import (
    _format_anchor_info,
    _monthly_histogram,
)
from backend.services.delphi_tools_git import execute_git_tool
from backend.services.delphi_tools_calendar import execute_calendar_tool

logger = logging.getLogger(__name__)


# ---------- Konfig ----------
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
) -> tuple[list[tuple[str, int, datetime, str]], dict]:
    """Findet Sources zu einem Topic ueber Anker-Cluster.

    Returns:
        sources: Liste (source_type, source_id, created_at, title=""),
                 sortiert nach created_at aufsteigend.
        anchor_info: dict aus _resolve_topic_anchor (Transparenz).
    """
    concept_ids, anchor_info = await _resolve_topic_anchor(db, topic)
    if concept_ids is None:
        return [], anchor_info

    # Concept -> Sources
    rows = (
        db.query(ConceptSource.source_type, ConceptSource.source_id)
        .filter(ConceptSource.concept_id.in_(concept_ids))
        .distinct()
        .limit(TIMELINE_MAX_SOURCES)
        .all()
    )

    # Bulk-Date-Lookup pro Source-Type
    by_type: dict[str, list[int]] = {}
    for stype, sid in rows:
        by_type.setdefault(stype, []).append(sid)

    dates_by_type: dict[str, dict[int, datetime]] = {}
    for stype, sids in by_type.items():
        dates_by_type[stype] = _fetch_created_at(db, stype, sids)

    # Liste zusammenbauen + sortieren
    out: list[tuple[str, int, datetime, str]] = []
    for stype, sid in rows:
        created = dates_by_type.get(stype, {}).get(sid)
        if created is None:
            continue
        out.append((stype, sid, created, ""))

    out.sort(key=lambda x: x[2])
    return out, anchor_info


# ---------- Tool 1: get_topic_timeline ----------
async def get_topic_timeline(db: Session, topic: str) -> str:
    """Findet Erwaehnungs-Verteilung eines Topics ueber die Zeit."""
    sources, anchor = await _gather_sources_for_topic(db, topic)
    if not sources:
        return (
            f"Keine Quellen zum Thema '{topic}' gefunden. "
            f"Hinweis: {_format_anchor_info(anchor)}."
        )

    earliest = sources[0][2]
    latest = sources[-1][2]
    span_days = (latest - earliest).days

    by_type: dict[str, int] = {}
    for stype, _, _, _ in sources:
        by_type[stype] = by_type.get(stype, 0) + 1
    type_summary = ", ".join(
        f"{n} {t}" for t, n in sorted(by_type.items(), key=lambda x: -x[1])
    )

    histogram = _monthly_histogram(sources)

    lines = [
        f"Erwaehnungen zum Thema '{topic}':",
        f"  {_format_anchor_info(anchor)}",
        f"  {len(sources)} Quellen ({type_summary})",
        f"  Spannweite: {earliest.strftime('%Y-%m-%d')} bis "
        f"{latest.strftime('%Y-%m-%d')} ({span_days} Tage)",
        histogram,
        "",
        "WICHTIG: Eine fruehe Erwaehnung bedeutet NICHT dass das Thema "
        "damals begann. Bei mehrdeutigen Begriffen (z.B. 'Metis' kann "
        "Pallas-Modul ODER griechische Goettin sein) koennen alte "
        "Erwaehnungen aus anderem Kontext stammen. Burst-Pattern im "
        "Histogramm ist meist informativer als das frueheste Datum.",
    ]
    return "\n".join(lines)


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
    sources, _anchor = await _gather_sources_for_topic(db, topic)
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

    lines = [
        f"Aelteste {len(oldest)} Quellen zum Thema '{topic}':",
        f"  {_format_anchor_info(_anchor)}",
        "",
    ]
    for stype, sid, created, _ in oldest:
        title = titles.get((stype, sid), f"#{sid}")
        lines.append(f"- {created.strftime('%Y-%m-%d')} [{stype}] {title}")

    lines.append("")
    lines.append(
        "WICHTIG: Bei mehrdeutigen Begriffen koennen die fruehen Quellen "
        "aus anderem Kontext stammen (z.B. 'Metis' als griechische Goettin "
        "vs. Pallas-Modul). Pruefe die Titel auf Plausibilitaet."
    )
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
        # Git-Tools (B-Track) sind sync — direkt durchreichen
        if name.startswith("git_"):
            return execute_git_tool(name, args, db)
        if name.startswith("calendar_"):
            return execute_calendar_tool(name, args, db)
        return f"Unbekanntes Werkzeug: {name}"
    except Exception as e:
        logger.exception(f"Tool {name} failed")
        return f"Fehler beim Ausfuehren von {name}: {type(e).__name__}: {e}"
