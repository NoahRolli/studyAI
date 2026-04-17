# Konzept-Merge Suggestions — Duplikat-Erkennung via Embeddings + AI
# Embedding-Similarity findet Kandidaten, AI liefert Begruendung
# Merge selbst nutzt bestehenden POST /api/concepts/merge

import json
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource
from backend.services.embedding_service import cosine_similarity
from backend.api.concepts_ai import ai_chat_with_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts/merge-suggestions", tags=["concepts-merge"])


def _find_similar_pairs(concepts: list, threshold: float) -> list[dict]:
    """Findet Konzeptpaare mit Embedding-Similarity ueber Schwellwert."""
    pairs = []
    with_emb = [(c, json.loads(c.embedding)) for c in concepts if c.embedding]

    for i in range(len(with_emb)):
        for j in range(i + 1, len(with_emb)):
            c1, emb1 = with_emb[i]
            c2, emb2 = with_emb[j]
            sim = cosine_similarity(emb1, emb2)
            if sim >= threshold and sim < 0.999:
                pairs.append({
                    "concept_a": {"id": c1.id, "name": c1.name},
                    "concept_b": {"id": c2.id, "name": c2.name},
                    "similarity": round(sim, 4),
                    "reason": None,
                })
    # Absteigend nach Similarity sortieren
    pairs.sort(key=lambda p: p["similarity"], reverse=True)
    return pairs[:50]


@router.get("")
async def get_merge_suggestions(
    threshold: float = Query(default=0.82, ge=0.5, le=0.99),
    ai_reason: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Merge-Kandidaten via Embedding-Similarity, optional mit AI-Begruendung."""
    concepts = db.query(Concept).all()
    pairs = _find_similar_pairs(concepts, threshold)

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
