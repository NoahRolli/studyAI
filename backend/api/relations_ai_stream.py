# Relations AI Stream — SSE-Endpoint für Live-Progress bei Detect
# Sendet Events pro Runde: round_start, round_done, round_error, complete
# Frontend nutzt EventSource um Events live zu empfangen

import json
import time
import logging
import random
import asyncio
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge
from backend.models.relation import RelationType
from backend.api.concepts_ai import ai_chat_with_provider, parse_json_response
from backend.api.relations_ai import (
    _get_confirmed_edges, _get_rejected_edges,
    _get_existing_pairs, _get_rejected_pairs,
    _build_concept_context, _parse_relations, _save_suggestions,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/relations", tags=["relations-ai-stream"])


def _sse_event(event: str, data: dict) -> str:
    """Formatiert ein SSE-Event als String."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/detect/stream")
async def detect_relations_stream(
    rounds: int = Query(default=10, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """SSE-Stream: AI analysiert Konzepte, sendet Progress pro Runde."""

    async def generate():
        concepts = db.query(Concept).all()
        if len(concepts) < 2:
            yield _sse_event("complete", {
                "suggested": 0, "rounds": 0,
                "message": "Zu wenige Konzepte",
            })
            return

        name_to_id = {c.name: c.id for c in concepts}
        types = db.query(RelationType).all()
        type_map = {t.name: t.id for t in types}
        type_desc = "\n".join(
            f"- {t.name} ({t.label_en}): {t.description or t.label_en}"
            for t in types
        )

        confirmed = _get_confirmed_edges(db)
        rejected = _get_rejected_edges(db)
        confirmed_ctx = ""
        if confirmed:
            confirmed_ctx = (
                "\n\nACCEPTED relations (follow this pattern):\n"
                + json.dumps(confirmed[:20], ensure_ascii=False)
            )
        rejected_ctx = ""
        if rejected:
            rejected_ctx = (
                "\n\nREJECTED relations (DO NOT suggest similar ones):\n"
                + json.dumps(rejected[:20], ensure_ascii=False)
            )

        existing = _get_existing_pairs(db)
        rejected_pairs = _get_rejected_pairs(db)
        total_created = 0
        batch_size = 25
        start_time = time.time()

        for i in range(rounds):
            round_start = time.time()
            yield _sse_event("round_start", {
                "round": i + 1, "total": rounds,
                "elapsed": round(time.time() - start_time, 1),
            })
            # Kurze Pause damit Browser Event verarbeiten kann
            await asyncio.sleep(0.05)

            shuffled = list(concepts)
            random.shuffle(shuffled)
            batch = shuffled[:batch_size]
            concept_list = _build_concept_context(batch, db)

            prompt = f"""You are a knowledge representation expert.
You analyze concepts and identify precise semantic relations.
You learn from accepted and rejected examples.
Each concept includes its source documents in [brackets].

Analyze these concepts and find PRECISE typed relations:

CONCEPTS (with sources):
{concept_list}

RELATION TYPES (use the most specific type):
{type_desc}
{confirmed_ctx}
{rejected_ctx}

STRICT RULES:
1. Only suggest where content clearly supports the connection
2. Use MOST SPECIFIC type — avoid "related_to" unless nothing else fits
3. Do NOT repeat previously rejected patterns
4. reason must be 2-3 sentences explaining the specific connection
5. Reference the source documents when possible
6. Explain what aspect of concept A relates to concept B

Find 3-8 HIGH-CONFIDENCE relations. Respond ONLY in valid JSON:
{{"relations": [{{"source": "concept_name", "target": "concept_name", "relation_type": "name", "reason": "Detailed 2-3 sentence explanation referencing sources"}}]}}"""

            try:
                raw, provider = await ai_chat_with_provider(
                    prompt, page="ontology"
                )
                suggestions = _parse_relations(raw)
                created = _save_suggestions(
                    suggestions, name_to_id, type_map,
                    existing, rejected_pairs, db,
                )
                total_created += created
                logger.info(
                    f"Runde {i+1}/{rounds}: {created} neu ({provider})"
                )
                yield _sse_event("round_done", {
                    "round": i + 1, "total": rounds,
                    "created": created, "total_created": total_created,
                    "provider": provider,
                    "round_time": round(time.time() - round_start, 1),
                    "elapsed": round(time.time() - start_time, 1),
                })
            except Exception as e:
                logger.warning(f"Runde {i+1}/{rounds} fehlgeschlagen: {e}")
                yield _sse_event("round_error", {
                    "round": i + 1, "total": rounds,
                    "error": str(e)[:200],
                    "elapsed": round(time.time() - start_time, 1),
                })

            # DB nach jeder Runde committen (statt nur am Ende)
            db.commit()
            await asyncio.sleep(0.05)

        yield _sse_event("complete", {
            "suggested": total_created,
            "rounds": rounds,
            "total_concepts": len(concepts),
            "elapsed": round(time.time() - start_time, 1),
        })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
