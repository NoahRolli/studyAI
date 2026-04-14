# Concepts Link Stream — SSE fuer Auto-Link mit Live-Progress
# Zeigt Batch-Fortschritt, Provider, neue Links pro Batch

import json
import time
import logging
import asyncio
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge
from backend.api.concepts_ai import ai_chat_with_provider, parse_json_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts", tags=["concepts-link-stream"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _link_batch_stream(
    db: Session, batch: list[str], name_to_id: dict,
) -> tuple[int, str]:
    """Linkt ein Batch, gibt (count, provider) zurueck."""
    concept_list = ", ".join(batch)
    prompt = (
        "You are a knowledge representation expert.\n"
        "Find semantic relations between these concepts.\n"
        "For each relation provide a reason (2-3 sentences).\n\n"
        f"Concepts: {concept_list}\n\n"
        "Return ONLY valid JSON:\n"
        '[{"source": "name", "target": "name", '
        '"relation_type": "related_to", '
        '"reason": "Detailed explanation"}]'
    )
    raw, provider = await ai_chat_with_provider(prompt, page="metis")
    parsed = parse_json_response(raw)
    if not isinstance(parsed, list):
        return 0, provider

    count = 0
    for item in parsed:
        if not isinstance(item, dict):
            continue
        src = name_to_id.get(item.get("source", "").strip().lower())
        tgt = name_to_id.get(item.get("target", "").strip().lower())
        if not src or not tgt or src == tgt:
            continue
        exists = db.query(ConceptEdge).filter(
            ConceptEdge.source_concept_id == src,
            ConceptEdge.target_concept_id == tgt,
        ).first()
        if exists:
            continue
        db.add(ConceptEdge(
            source_concept_id=src, target_concept_id=tgt,
            relation_type_id=8, strength=0.5,
            origin="ai_suggested", status="suggested",
            reason=item.get("reason", ""),
        ))
        count += 1
    return count, provider


@router.get("/auto-link/stream")
async def auto_link_stream(db: Session = Depends(get_db)):
    """SSE-Stream: Auto-Link mit Batch-Fortschritt."""

    async def generate():
        concepts = db.query(Concept).all()
        if len(concepts) < 2:
            yield _sse("complete", {"suggestions": 0, "message": "Zu wenige Konzepte"})
            return

        name_to_id = {c.name: c.id for c in concepts}
        start = time.time()

        # Ko-Vorkommen Batches bauen
        rows = db.execute(text(
            "SELECT DISTINCT cs1.concept_id, cs2.concept_id "
            "FROM concept_sources cs1 "
            "JOIN concept_sources cs2 ON cs1.source_type = cs2.source_type "
            "AND cs1.source_id = cs2.source_id "
            "AND cs1.concept_id < cs2.concept_id"
        )).fetchall()

        groups: dict[int, set[int]] = {}
        for c1, c2 in rows:
            if c1 not in groups:
                groups[c1] = {c1}
            groups[c1].add(c2)

        processed: set[int] = set()
        batches: list[list[str]] = []
        for seed, members in sorted(groups.items(), key=lambda x: -len(x[1])):
            batch_ids = members - processed
            if len(batch_ids) < 2:
                continue
            names = []
            for cid in batch_ids:
                c = next((c for c in concepts if c.id == cid), None)
                if c:
                    names.append(c.name)
                    processed.add(cid)
            if len(names) >= 2:
                batches.append(names)

        remaining = [c.name for c in concepts if c.id not in processed]
        for i in range(0, len(remaining), 30):
            chunk = remaining[i:i + 30]
            if len(chunk) >= 2:
                batches.append(chunk)

        total_batches = len(batches)
        total_links = 0

        yield _sse("status", {
            "batches": total_batches,
            "concepts": len(concepts),
        })

        for i, batch in enumerate(batches):
            yield _sse("batch_start", {
                "batch": i + 1, "total": total_batches,
                "size": len(batch),
                "elapsed": round(time.time() - start, 1),
            })
            await asyncio.sleep(0.05)

            try:
                count, provider = await _link_batch_stream(db, batch, name_to_id)
                total_links += count
                db.commit()
                yield _sse("batch_done", {
                    "batch": i + 1, "total": total_batches,
                    "created": count, "total_created": total_links,
                    "provider": provider,
                    "elapsed": round(time.time() - start, 1),
                })
            except Exception as e:
                logger.warning(f"Batch {i+1} fehlgeschlagen: {e}")
                yield _sse("batch_error", {
                    "batch": i + 1, "total": total_batches,
                    "error": str(e)[:200],
                })

            await asyncio.sleep(0.05)

        yield _sse("complete", {
            "suggestions": total_links,
            "batches": total_batches,
            "elapsed": round(time.time() - start, 1),
        })

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
