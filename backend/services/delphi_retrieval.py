"""
Delphi Retrieval-Service — Hauptinterface fuer Vector-Search.

Ablauf pro Query:
1. Frage -> Embedding (bge-m3 via embedding_service)
2. Cosine-Similarity gegen In-Memory Concept-Embedding-Matrix
3. Top-K Concepts -> Source-Resolution via concept_sources
4. Dedup auf unique Sources, kombinierter Score (similarity * relevance)
5. Confidence-Tier anhand Top-Score (high/medium/low)

Slice 1: Sources sind ausschliesslich Notes + Summaries.
Slice 2 wird LLM-Chat-Messages via SQLite FTS5 dazuholen.
"""

import logging
import asyncio
import numpy as np
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session

from backend.models.concept import ConceptSource
from backend.models.note import Note
from backend.models.summary import Summary
from backend.services.embedding_service import generate_embedding
from backend.services.delphi_retrieval_cache import get_embedding_cache

logger = logging.getLogger(__name__)


# ---------- Config ----------
TOP_K_CONCEPTS = 15            # Wieviele Concepts via Vector-Search holen
TOP_N_SOURCES = 8              # Wieviele unique Sources final zurueckgeben
PREVIEW_CHARS = 240            # Snippet-Laenge fuer Citation-Preview

CONFIDENCE_HIGH_THRESHOLD = 0.75
CONFIDENCE_MEDIUM_THRESHOLD = 0.55


# ---------- Result-Dataclasses ----------
@dataclass
class RetrievedSource:
    source_type: str          # "note" | "summary"
    source_id: int
    title: str
    preview_text: str
    similarity_score: float   # Best-Concept-Score fuer diese Source
    matched_concept_id: int
    matched_concept_name: str


@dataclass
class RetrievalResult:
    query: str
    confidence: str           # "high" | "medium" | "low"
    top_score: float
    sources: list[RetrievedSource]


# ---------- Helpers ----------
def _classify_confidence(top_score: float) -> str:
    if top_score >= CONFIDENCE_HIGH_THRESHOLD:
        return "high"
    if top_score >= CONFIDENCE_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def _fetch_source_metadata(
    db: Session,
    source_type: str,
    source_id: int,
) -> Optional[tuple[str, str]]:
    """Holt (title, preview_text) fuer eine Source. None wenn nicht gefunden."""
    if source_type == "note":
        note = db.query(Note).filter(Note.id == source_id).first()
        if not note:
            return None
        # Note.content ist HTML/TipTap -> rough strip fuer Preview
        preview = (note.content or "").replace("<", " <")[:PREVIEW_CHARS * 2]
        return note.title, preview[:PREVIEW_CHARS].strip()

    if source_type == "summary":
        summary = db.query(Summary).filter(Summary.id == source_id).first()
        if not summary:
            return None
        title = getattr(summary, "title", None) or f"Summary #{source_id}"
        content = getattr(summary, "content", "") or ""
        return title, content[:PREVIEW_CHARS].strip()

    return None


# ---------- Hauptinterface ----------
async def retrieve_for_query(
    query: str,
    db: Session,
    top_k: int = TOP_K_CONCEPTS,
    top_n_sources: int = TOP_N_SOURCES,
) -> RetrievalResult:
    """Sucht Top-N relevante Sources fuer eine Query.

    Bei leerem Cache (keine Concepts) -> confidence='low', sources=[].
    """
    # 1) Query-Embedding
    query_vec = await generate_embedding(query)
    q = np.asarray(query_vec, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm < 1e-9:
        return RetrievalResult(query=query, confidence="low", top_score=0.0, sources=[])
    q = q / q_norm

    # 2) Cache + Vector-Search
    matrix, ids, names = await get_embedding_cache(db)
    if matrix.shape[0] == 0:
        return RetrievalResult(query=query, confidence="low", top_score=0.0, sources=[])

    def _vector_search() -> tuple[np.ndarray, np.ndarray]:
        scores = matrix @ q  # Dot-Product == Cosine (L2-normalisiert)
        k = min(top_k, scores.shape[0])
        # argpartition O(N) fuer Top-K, danach nur K Elemente sortieren
        top_idx_unsorted = np.argpartition(-scores, k - 1)[:k]
        top_idx = top_idx_unsorted[np.argsort(-scores[top_idx_unsorted])]
        return top_idx, scores[top_idx]

    top_idx, top_scores = await asyncio.to_thread(_vector_search)

    if top_scores.size == 0:
        return RetrievalResult(query=query, confidence="low", top_score=0.0, sources=[])

    top_concept_ids = ids[top_idx].tolist()
    top_concept_names = [names[i] for i in top_idx]
    top_score = float(top_scores[0])

    # 3) Concept -> Sources via concept_sources
    sources_rows = (
        db.query(ConceptSource)
        .filter(ConceptSource.concept_id.in_(top_concept_ids))
        .all()
    )

    cid_to_score = {
        cid: float(top_scores[i]) for i, cid in enumerate(top_concept_ids)
    }
    cid_to_name = dict(zip(top_concept_ids, top_concept_names))

    # 4) Dedup auf unique (source_type, source_id), best combined-Score wins
    best_per_source: dict[tuple[str, int], dict] = {}
    for row in sources_rows:
        key = (row.source_type, row.source_id)
        concept_score = cid_to_score.get(row.concept_id, 0.0)
        # Combined Rank: similarity weighted by relevance (0.5..1.0 multiplier)
        combined = concept_score * (0.5 + 0.5 * (row.relevance or 0.5))
        existing = best_per_source.get(key)
        if existing is None or combined > existing["combined"]:
            best_per_source[key] = {
                "source_type": row.source_type,
                "source_id": row.source_id,
                "concept_id": row.concept_id,
                "concept_name": cid_to_name.get(row.concept_id, "?"),
                "similarity_score": concept_score,
                "combined": combined,
            }

    # 5) Sortieren + Top-N + Metadata
    ranked = sorted(
        best_per_source.values(),
        key=lambda s: s["combined"],
        reverse=True,
    )

    out: list[RetrievedSource] = []
    for entry in ranked:
        if len(out) >= top_n_sources:
            break
        meta = _fetch_source_metadata(db, entry["source_type"], entry["source_id"])
        if meta is None:
            continue  # Source geloescht
        title, preview = meta
        out.append(RetrievedSource(
            source_type=entry["source_type"],
            source_id=entry["source_id"],
            title=title,
            preview_text=preview,
            similarity_score=entry["similarity_score"],
            matched_concept_id=entry["concept_id"],
            matched_concept_name=entry["concept_name"],
        ))

    return RetrievalResult(
        query=query,
        confidence=_classify_confidence(top_score),
        top_score=top_score,
        sources=out,
    )
