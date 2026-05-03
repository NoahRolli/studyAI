# Concepts Cluster Stream — SSE fuer Auto-Cluster mit Live-Progress
# Zeigt Batch-Fortschritt, Provider, neue Cluster pro Batch
#
# Bulk-Workload-Pattern:
# - disable_groq=True (vermeidet 429-Pingpong bei hunderten Calls)
# - Forward-Progress: alte Cluster bleiben bis neue fertig sind
# - Cancel-Detection: bricht sauber ab wenn Frontend SSE schliesst

import json
import time
import logging
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import (
    Concept, ConceptCluster, ConceptClusterMember,
)
from backend.api.concepts_ai import ai_chat_with_provider, parse_json_response
from backend.api.concepts_cluster import (
    _build_concept_folder_map, _build_folder_batches,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts", tags=["concepts-cluster-stream"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/auto-cluster/stream")
async def auto_cluster_stream(
    request: Request,
    db: Session = Depends(get_db),
):
    """SSE-Stream: Auto-Cluster mit Batch-Fortschritt.

    Forward-Progress-Pattern: alte Cluster bleiben live bis der
    komplette Run durch ist. Cancel oder Crash laesst die alten
    Cluster intakt, die neuen Vorschlaege werden verworfen.
    """

    async def generate():
        concepts = db.query(Concept).all()
        if len(concepts) < 3:
            yield _sse("complete", {"clusters": 0, "message": "Zu wenige Konzepte"})
            return

        name_to_id = {c.name: c.id for c in concepts}
        concept_folder = _build_concept_folder_map(db)
        batches = _build_folder_batches(concepts, concept_folder, db)
        total_batches = len(batches)
        start = time.time()
        all_clusters: dict[str, list[str]] = {}

        yield _sse("status", {
            "batches": total_batches,
            "concepts": len(concepts),
        })

        for i, (folder_hint, batch) in enumerate(batches):
            # Cancel-Check: hat das Frontend die SSE-Verbindung geschlossen?
            if await request.is_disconnected():
                logger.info(
                    f"Auto-Cluster cancelled at batch {i+1}/{total_batches} "
                    "— old clusters preserved (forward-progress)"
                )
                yield _sse("cancelled", {
                    "batch": i + 1, "total": total_batches,
                    "elapsed": round(time.time() - start, 1),
                })
                return

            if len(batch) < 2:
                continue

            yield _sse("batch_start", {
                "batch": i + 1, "total": total_batches,
                "size": len(batch), "folder": folder_hint or "—",
                "elapsed": round(time.time() - start, 1),
            })
            await asyncio.sleep(0.05)

            folder_ctx = ""
            if folder_hint:
                folder_ctx = (
                    f"These concepts come from the folder '{folder_hint}'. "
                    "Use this as context for grouping, but create "
                    "sub-groups if the topics differ.\n\n"
                )

            prompt = (
                "Group these concepts into thematic clusters. "
                "Each cluster should have a short descriptive label "
                "and a list of member concepts. "
                "Return ONLY a JSON array of objects with "
                "'label' and 'members' fields. "
                "Example: [{\"label\": \"Ethics\", "
                "\"members\": [\"autonomy\", \"privacy\"]}]\n\n"
                f"{folder_ctx}"
                f"Concepts: {json.dumps(batch)}"
            )

            try:
                # disable_groq=True: Bulk-Workload, vermeidet 429-Pingpong
                raw, provider = await ai_chat_with_provider(
                    prompt, page="metis", disable_groq=True,
                )
                parsed = parse_json_response(raw)
                batch_clusters = 0
                if isinstance(parsed, list):
                    for item in parsed:
                        if not isinstance(item, dict):
                            continue
                        label = str(item.get("label", "")).strip()
                        members = item.get("members", [])
                        if not label or not isinstance(members, list):
                            continue
                        label_lower = label.lower()
                        if label_lower not in all_clusters:
                            all_clusters[label_lower] = []
                        for m in members:
                            name = str(m).strip().lower()
                            if name in name_to_id and name not in all_clusters[label_lower]:
                                all_clusters[label_lower].append(name)
                        batch_clusters += 1

                yield _sse("batch_done", {
                    "batch": i + 1, "total": total_batches,
                    "clusters_in_batch": batch_clusters,
                    "total_clusters": len(all_clusters),
                    "provider": provider,
                    "elapsed": round(time.time() - start, 1),
                })
            except Exception as e:
                logger.warning(f"Cluster Batch {i+1} fehlgeschlagen: {e}")
                yield _sse("batch_error", {
                    "batch": i + 1, "total": total_batches,
                    "error": str(e)[:200],
                })

            await asyncio.sleep(0.05)

        # Final-Cancel-Check vor dem destruktiven Swap
        if await request.is_disconnected():
            logger.info("Auto-Cluster cancelled before commit — old clusters preserved")
            yield _sse("cancelled", {
                "batch": total_batches, "total": total_batches,
                "elapsed": round(time.time() - start, 1),
            })
            return

        # Atomic Swap: alte Cluster loeschen + neue speichern in einer Transaktion
        # Bei Fehler hier rollt SQLAlchemy auf den Stand vor dem delete zurueck.
        db.query(ConceptClusterMember).delete()
        db.query(ConceptCluster).delete()
        db.flush()

        count = 0
        for label, members in all_clusters.items():
            if len(members) < 2:
                continue
            cluster = ConceptCluster(label=label.title())
            db.add(cluster)
            db.flush()
            for name in members:
                db.add(ConceptClusterMember(
                    cluster_id=cluster.id,
                    concept_id=name_to_id[name],
                ))
            count += 1

        db.commit()
        yield _sse("complete", {
            "clusters": count,
            "batches": total_batches,
            "total_concepts": len(concepts),
            "elapsed": round(time.time() - start, 1),
        })

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
