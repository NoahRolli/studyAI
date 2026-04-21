# Konzept-Merge Suggestions — Duplikat-Erkennung via Embeddings + AI
# Embedding-Similarity findet Kandidaten, AI liefert Begruendung
# Merge selbst nutzt bestehenden POST /api/concepts/merge

import asyncio
import json
import logging
import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource
from backend.services.embedding_service import cosine_similarity
from backend.api.concepts_ai import ai_chat_with_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts/merge-suggestions", tags=["concepts-merge"])


def _find_similar_pairs(concepts: list, threshold: float) -> list[dict]:
    """Findet Konzeptpaare mit Embedding-Similarity ueber Schwellwert.
    Numpy-vektorisiert: Cosine = normalisierte Matrix @ Matrix.T.
    Bei 6k+ Konzepten ~1-2s statt 30-60s Python-Loop.
    """
    # Embeddings laden + filtern
    vectors, ids, names = [], [], []
    for c in concepts:
        if not c.embedding:
            continue
        try:
            vec = json.loads(c.embedding)
        except (json.JSONDecodeError, TypeError):
            continue
        vectors.append(vec)
        ids.append(c.id)
        names.append(c.name)

    n = len(vectors)
    if n < 2:
        return []

    # L2-normalisieren, dann Cosine = M @ M.T
    M = np.array(vectors, dtype=np.float32)
    norms = np.linalg.norm(M, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Mn = M / norms
    sim = Mn @ Mn.T  # (N, N)

    # Oberes Dreieck (i < j), Threshold-Mask
    iu_i, iu_j = np.triu_indices(n, k=1)
    sim_flat = sim[iu_i, iu_j]
    mask = (sim_flat >= threshold) & (sim_flat < 0.999)
    idx = np.where(mask)[0]

    pairs = [
        {
            "concept_a": {"id": ids[iu_i[k]], "name": names[iu_i[k]]},
            "concept_b": {"id": ids[iu_j[k]], "name": names[iu_j[k]]},
            "similarity": round(float(sim_flat[k]), 4),
            "reason": None,
        }
        for k in idx
    ]
    pairs.sort(key=lambda p: p["similarity"], reverse=True)
    return pairs[:50]


@router.get("")
async def get_merge_suggestions(
    threshold: float = Query(default=0.90, ge=0.5, le=0.99),
    ai_reason: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Merge-Kandidaten via Embedding-Similarity, optional mit AI-Begruendung.
    Numpy + to_thread: blockiert den async event loop nicht bei 6k+ Konzepten.
    """
    concepts = db.query(Concept).filter(Concept.embedding.isnot(None)).all()
    pairs = await asyncio.to_thread(_find_similar_pairs, concepts, threshold)

    if not pairs:
        return {"pairs": [], "total": 0}

    # Optional: AI-Begruendung fuer Top-Kandidaten
    if ai_reason and pairs:
        top = pairs[:10]
        names = "\n".join(
            f"- {p['concept_a']['name']} <-> {p['concept_b']['name']} (sim: {p['similarity']})"
            for p in top
        )
        prompt = (
            "Du bist ein Wissensmanagement-Assistent. "
            "Folgende Konzeptpaare haben hohe Aehnlichkeit und koennten Duplikate sein.\n\n"
            f"{names}\n\n"
            "Fuer jedes Paar: Antworte NUR mit einem JSON-Array. Jedes Element hat:\n"
            '{"a": "name_a", "b": "name_b", "merge": true/false, "reason": "kurze Begruendung"}\n'
            "Keine Erklaerung, nur JSON."
        )
        try:
            text, provider = await ai_chat_with_provider(prompt, "ontology")
            # JSON aus Response extrahieren
            start = text.find("[")
            end = text.rfind("]") + 1
            if start >= 0 and end > start:
                ai_results = json.loads(text[start:end])
                reason_map = {
                    (r["a"].lower(), r["b"].lower()): r
                    for r in ai_results if isinstance(r, dict)
                }
                for p in top:
                    key = (p["concept_a"]["name"], p["concept_b"]["name"])
                    ai = reason_map.get(key)
                    if ai:
                        p["reason"] = ai.get("reason")
                        p["ai_merge"] = ai.get("merge", True)
                        p["model_used"] = provider
        except Exception as e:
            logger.warning(f"AI-Reason fehlgeschlagen: {e}")

    return {"pairs": pairs, "total": len(pairs)}
