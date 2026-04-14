# Concepts Embedding — Generiert Embeddings + findet Similarity-Edges
# Nutzt nomic-embed-text via Ollama für 768-dim Vektoren
# Embeddings werden als JSON-String im Concept gespeichert
# Similarity-Edges: concept_edges mit origin='embedding_similarity'

import json
import logging
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge
from backend.services.embedding_service import (
    generate_embedding, cosine_similarity,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts", tags=["concepts-embedding"])


def _sse_event(event: str, data: dict) -> str:
    """Formatiert ein SSE-Event als String."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/embeddings/stream")
async def update_embeddings_stream(
    threshold: float = Query(default=0.75, ge=0.3, le=0.95),
    db: Session = Depends(get_db),
):
    """SSE-Stream: Embeddings generieren + Similarity-Edges erstellen."""

    async def generate():
        # 1. Alle Konzepte laden
        concepts = db.query(Concept).all()
        stale = [c for c in concepts if c.embedding_stale or not c.embedding]
        total = len(stale)

        yield _sse_event("status", {
            "phase": "embeddings", "total": total,
            "message": f"Generiere Embeddings fuer {total} Konzepte...",
        })

        # 2. Embeddings generieren fuer stale Konzepte
        updated = 0
        errors = 0
        for i, concept in enumerate(stale):
            try:
                text = concept.name
                if concept.description:
                    text += f" — {concept.description[:500]}"
                emb = await generate_embedding(text)
                concept.embedding = json.dumps(emb)
                concept.embedding_stale = False
                updated += 1
                if (i + 1) % 10 == 0 or i == total - 1:
                    db.commit()
                    yield _sse_event("embedding_progress", {
                        "done": i + 1, "total": total,
                        "updated": updated, "errors": errors,
                    })
            except Exception as e:
                errors += 1
                logger.warning(f"Embedding fuer '{concept.name}' fehlgeschlagen: {e}")
                continue

        db.commit()
        yield _sse_event("status", {
            "phase": "similarity", "updated": updated,
            "message": "Berechne Aehnlichkeiten...",
        })

        # 3. Alle Konzepte mit Embeddings laden
        concepts_with_emb = db.query(Concept).filter(
            Concept.embedding.isnot(None)
        ).all()

        # ALLE bestehenden Edges laden (nicht nur similarity)
        existing_sim = set()
        all_edges = db.query(ConceptEdge).all()
        for e in all_edges:
            existing_sim.add((e.source_concept_id, e.target_concept_id))
            existing_sim.add((e.target_concept_id, e.source_concept_id))

        # related_to Typ-ID holen
        from backend.models.relation import RelationType
        rt = db.query(RelationType).filter(
            RelationType.name == "related_to"
        ).first()
        if not rt:
            yield _sse_event("complete", {
                "embeddings_updated": updated,
                "edges_created": 0,
                "error": "RelationType 'related_to' nicht gefunden",
            })
            return

        # 4. Paarweise Aehnlichkeit berechnen
        embeddings = {}
        for c in concepts_with_emb:
            try:
                embeddings[c.id] = json.loads(c.embedding)
            except (json.JSONDecodeError, TypeError):
                continue

        concept_ids = list(embeddings.keys())
        id_to_name = {c.id: c.name for c in concepts_with_emb}
        edges_created = 0
        pairs_checked = 0
        total_pairs = len(concept_ids) * (len(concept_ids) - 1) // 2

        for i in range(len(concept_ids)):
            for j in range(i + 1, len(concept_ids)):
                id_a, id_b = concept_ids[i], concept_ids[j]
                pairs_checked += 1

                if (id_a, id_b) in existing_sim:
                    continue

                sim = cosine_similarity(embeddings[id_a], embeddings[id_b])
                if sim >= threshold:
                    db.add(ConceptEdge(
                        source_concept_id=id_a,
                        target_concept_id=id_b,
                        relation_type_id=rt.id,
                        strength=round(sim, 3),
                        origin="embedding_similarity",
                        status="suggested",
                        reason=f"Embedding similarity: {sim:.2f}",
                    ))
                    edges_created += 1
                    existing_sim.add((id_a, id_b))

            # Progress alle 50 Konzepte
            if (i + 1) % 50 == 0:
                db.commit()
                yield _sse_event("similarity_progress", {
                    "pairs_checked": pairs_checked,
                    "total_pairs": total_pairs,
                    "edges_created": edges_created,
                })

        db.commit()
        yield _sse_event("complete", {
            "embeddings_updated": updated,
            "embedding_errors": errors,
            "edges_created": edges_created,
            "pairs_checked": total_pairs,
            "threshold": threshold,
        })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/embeddings/similarity-edges")
async def clear_similarity_edges(db: Session = Depends(get_db)):
    """Alle Embedding-Similarity-Edges loeschen (Reset)."""
    deleted = db.query(ConceptEdge).filter(
        ConceptEdge.origin == "embedding_similarity"
    ).delete()
    db.commit()
    return {"deleted": deleted}
