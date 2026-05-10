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
import json
import asyncio
import numpy as np
from datetime import datetime
from sqlalchemy.orm import Session

import backend.models.registry  # noqa: F401  Lazy-loads ALLE Models.
                                  # Vermeidet "Document not found"-Errors
                                  # bei Cross-Model-Relationships.

from backend.models.concept import ConceptSource, ConceptCluster, ConceptClusterMember
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
ANCHOR_MIN_SIMILARITY = 0.5         # Top-1 muss diese Similarity erreichen,
                                    # sonst kein Cluster-Filter (Fallback)
MIN_CLUSTER_CONCEPTS = 3            # Mini-Cluster -> Fallback statt zu eng
MIN_CLUSTER_CENTROID_SIM = 0.5      # Wenn der gewaehlte Cluster zu weit
                                    # weg vom Query-Embedding ist, lieber
                                    # Top-K-Fallback statt fehlfokussiert


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


# ---------- Helper: Topic -> Cluster-Anker ----------
async def _resolve_topic_anchor(
    db: Session,
    topic: str,
) -> tuple[list[int] | None, dict]:
    """Topic-String -> (concept_ids fuer Source-Lookup, anchor_info).

    Strategie:
    1) Top-1 Concept via Embedding-Match.
    2) Dessen Cluster-Memberships lookuppen (n:m moeglich).
    3) Falls Cluster mit >= MIN_CLUSTER_CONCEPTS existiert:
       returne alle Concepts dieser Cluster (thematisch gefiltert).
    4) Sonst Fallback: Top-K Concepts wie bisher.

    Returns:
        concept_ids: Liste der Concept-IDs fuer ConceptSource-Filter,
                     oder None bei leerem Embedding-Cache.
        anchor_info: Transparenz-Dict (anchor_name, anchor_similarity,
                     cluster_filter_applied, cluster_labels,
                     cluster_concept_count).
    """
    info: dict = {
        "anchor_name": None,
        "anchor_similarity": 0.0,
        "cluster_filter_applied": False,
        "cluster_labels": [],
        "cluster_concept_count": 0,
        "cluster_centroid_sim": 0.0,
    }

    # 1) Topic-Embedding
    query_vec = await generate_embedding(topic)
    q = np.asarray(query_vec, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm < 1e-9:
        return None, info
    q = q / q_norm

    # 2) Top-K Concepts (Fallback braucht die sowieso)
    matrix, ids, names = await get_embedding_cache(db)
    if matrix.shape[0] == 0:
        return None, info
    scores = matrix @ q
    k = min(TIMELINE_TOP_K_CONCEPTS, scores.shape[0])
    top_idx = np.argpartition(-scores, k - 1)[:k]
    fallback_ids = ids[top_idx].tolist()

    # 3) Echtes Top-1 fuer Anker (argpartition ist nicht sortiert).
    #    best_local indexiert top_idx, top_idx[best_local] ist global.
    #    names ist eine Liste, deshalb Skalar-Index statt Array-Index.
    best_local = int(np.argmax(scores[top_idx]))
    anchor_global_idx = int(top_idx[best_local])
    anchor_concept_id = int(ids[anchor_global_idx])
    anchor_similarity = float(scores[anchor_global_idx])
    info["anchor_name"] = str(names[anchor_global_idx])
    info["anchor_similarity"] = anchor_similarity

    # 4) Similarity-Cutoff
    if anchor_similarity < ANCHOR_MIN_SIMILARITY:
        return fallback_ids, info

    # 5) Cluster-Memberships des Ankers (n:m moeglich)
    cluster_ids = [
        r[0] for r in db.query(ConceptClusterMember.cluster_id).filter(
            ConceptClusterMember.concept_id == anchor_concept_id
        ).all()
    ]
    if not cluster_ids:
        return fallback_ids, info

    # 6) Top-Cluster waehlen via Centroid-Cosine zum Query.
    #    Bei n:m wuerde "alle nehmen" den Filter aufweichen — wir wollen
    #    den thematisch passendsten Cluster, nicht alle.
    cluster_rows = db.query(
        ConceptCluster.id, ConceptCluster.label, ConceptCluster.centroid_text
    ).filter(ConceptCluster.id.in_(cluster_ids)).all()

    best: tuple[int, str, float] | None = None  # (cluster_id, label, sim)
    for cl_id, cl_label, centroid_text in cluster_rows:
        if not centroid_text:
            continue
        try:
            cv = np.asarray(json.loads(centroid_text), dtype=np.float32)
        except (ValueError, TypeError):
            continue
        if cv.shape != q.shape:
            continue
        cv_norm = np.linalg.norm(cv)
        if cv_norm < 1e-9:
            continue
        sim = float(np.dot(q, cv / cv_norm))
        if best is None or sim > best[2]:
            best = (cl_id, cl_label, sim)

    if best is None or best[2] < MIN_CLUSTER_CENTROID_SIM:
        # Cluster-Centroid zu weit weg oder kaputter Centroid -> Fallback
        return fallback_ids, info

    best_cluster_id, best_cluster_label, best_centroid_sim = best

    # 7) Concepts NUR aus dem gewaehlten Cluster
    cluster_concept_ids = [
        r[0] for r in db.query(ConceptClusterMember.concept_id).filter(
            ConceptClusterMember.cluster_id == best_cluster_id
        ).distinct().all()
    ]
    if len(cluster_concept_ids) < MIN_CLUSTER_CONCEPTS:
        return fallback_ids, info

    info["cluster_filter_applied"] = True
    info["cluster_labels"] = [best_cluster_label]
    info["cluster_concept_count"] = len(cluster_concept_ids)
    info["cluster_centroid_sim"] = best_centroid_sim
    return cluster_concept_ids, info


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


# ---------- Helper: Output-Formatierung ----------
def _format_anchor_info(info: dict) -> str:
    """Kurze Transparenz-Zeile fuer Tool-Outputs ueber den Anker."""
    name = info.get("anchor_name")
    if not name:
        return "kein Anker im Embedding-Cache gefunden"
    sim = info.get("anchor_similarity", 0.0)
    if info.get("cluster_filter_applied"):
        labels = info.get("cluster_labels") or []
        label = labels[0] if labels else "unbekannt"
        n = info.get("cluster_concept_count", 0)
        c_sim = info.get("cluster_centroid_sim", 0.0)
        return (
            f"Anker '{name}' (sim {sim:.2f}), Cluster '{label}' "
            f"(centroid-sim {c_sim:.2f}, {n} Concepts)"
        )
    return (
        f"Anker '{name}' (sim {sim:.2f}), kein klarer Cluster gefunden "
        f"-> Fallback auf Top-K-Embedding-Match (kann thematisch streuen)"
    )


def _monthly_histogram(
    sources: list[tuple[str, int, datetime, str]],
) -> str:
    """Kompaktes ASCII-Histogramm pro Monat (YYYY-MM -> Anzahl).

    Nur Monate mit Eintraegen werden gelistet. Wenn die Spanne
    Luecken hat sind die explizit als '0' eingetragen, damit Bursts
    sichtbar werden.
    """
    if not sources:
        return ""
    counts: dict[str, int] = {}
    for _, _, created, _ in sources:
        key = created.strftime("%Y-%m")
        counts[key] = counts.get(key, 0) + 1

    # Luecken in der Spanne fuellen damit Bursts sichtbar werden
    keys_sorted = sorted(counts)
    if keys_sorted:
        first_y, first_m = map(int, keys_sorted[0].split("-"))
        last_y, last_m = map(int, keys_sorted[-1].split("-"))
        full: list[str] = []
        y, m = first_y, first_m
        while (y, m) <= (last_y, last_m):
            full.append(f"{y:04d}-{m:02d}")
            m += 1
            if m > 12:
                m = 1
                y += 1
        for k in full:
            counts.setdefault(k, 0)
        keys_sorted = full

    max_count = max(counts.values()) if counts else 1
    lines = ["  Verteilung pro Monat:"]
    for k in keys_sorted:
        n = counts[k]
        bar_width = int(round(20 * n / max_count)) if max_count else 0
        bar = "#" * bar_width
        lines.append(f"    {k}: {n:>4}  {bar}")
    return "\n".join(lines)


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
        return f"Unbekanntes Werkzeug: {name}"
    except Exception as e:
        logger.exception(f"Tool {name} failed")
        return f"Fehler beim Ausfuehren von {name}: {type(e).__name__}: {e}"
