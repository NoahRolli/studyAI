# Concepts Cluster Stream — SSE fuer Auto-Cluster mit Live-Progress
# Zeigt Batch-Fortschritt, Provider, neue Cluster pro Batch
#
# Bulk-Workload-Pattern:
# - disable_groq=True (vermeidet 429-Pingpong bei hunderten Calls)
# - Forward-Progress: alte Cluster bleiben bis neue fertig sind
# - Cancel-Detection: bricht sauber ab wenn Frontend SSE schliesst
# - Parallelisierung: Semaphore(2) bounded concurrency + as_completed
#   fuer Live-Progress-Events bei parallelem Ablauf

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
from backend.api.concepts_ai import (
    ai_chat_with_provider, parse_json_response,
    invalidate_cluster_label_cache,
)
from backend.api.concepts_cluster import (
    _build_concept_folder_map, _build_folder_batches,
)

# Phase 2: nach Cluster-Persistierung automatisch Layout neu berechnen.
# Importe aus den scripts/, weil run() und compute_centroids() bereits
# saubere importierbare Funktionen sind. Subprocess waere overkill.
import sys
from pathlib import Path as _Path
_SCRIPTS_DIR = _Path(__file__).resolve().parent.parent.parent / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
from compute_cluster_centroids import compute_centroids as _compute_centroids
from compute_sphere_layout import run as _run_sphere_layout

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/concepts", tags=["concepts-cluster-stream"])

# Bounded Concurrency: max parallele LLM-Calls.
# 2 ist sweet spot fuer MacBook-Ollama: serialisiert intern auf GPU,
# aber Dispatch-Overhead + JSON-Parsing parallelisiert. Bei 4 wird
# unter Last die Ollama-Queue instabil (Chat-Calls timeouten waehrend
# parallele Embedding-Calls laufen). Siehe Cluster-1-Notiz Chat 66.
CLUSTER_CONCURRENCY = 2


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _layout_phase_events(request):
    """Phase 2 nach Cluster-Persistierung: Centroids + Force-Sim neu berechnen.

    Yielded SSE-Events fuer Live-Progress. Faengt Cancel und Exceptions
    intern ab und sendet entsprechende Events. Crasht nie nach aussen
    (Cluster sind bereits committed).

    Events:
      - layout_phase (phase=centroids|force_sim)
      - layout_done
      - layout_failed (bei Exception)
      - cancelled (bei Disconnect zwischen Phasen)
    """
    layout_start = time.time()
    loop = asyncio.get_event_loop()
    try:
        if await request.is_disconnected():
            logger.info("Auto-Cluster: cancelled before layout phase")
            yield _sse("cancelled", {"phase": "after_clusters"})
            return

        yield _sse("layout_phase", {
            "phase": "centroids",
            "message": "Centroide berechnen ...",
        })
        # force=True weil Cluster komplett neu sind
        centroid_result = await loop.run_in_executor(
            None, _compute_centroids, True,
        )
        logger.info(f"Auto-Cluster: centroids done -> {centroid_result}")

        if await request.is_disconnected():
            logger.info("Auto-Cluster: cancelled after centroids")
            yield _sse("cancelled", {"phase": "after_centroids"})
            return

        yield _sse("layout_phase", {
            "phase": "force_sim",
            "message": "Force-Sim laeuft (200 Iterationen) ...",
        })
        # Default-Werte aus compute_sphere_layout.py CLI
        layout_rc = await loop.run_in_executor(
            None, _run_sphere_layout, 200, 0.85,
        )
        if layout_rc != 0:
            logger.warning(f"Auto-Cluster: layout returned non-zero rc={layout_rc}")

        yield _sse("layout_done", {
            "elapsed": round(time.time() - layout_start, 1),
            "rc": layout_rc,
        })
    except RuntimeError as exc:
        # Hard-Fail aus cluster_layout_service (z.B. Force-Sim divergiert).
        # Cluster bleiben in DB, nur Layout ist nicht aktualisiert.
        logger.error(f"Auto-Cluster: layout phase failed: {exc}")
        yield _sse("layout_failed", {
            "error": str(exc),
            "message": "Cluster gespeichert, aber Layout-Compute "
                       "fehlgeschlagen. Manuell ausloesen via "
                       "scripts/compute_sphere_layout.py.",
        })
    except Exception as exc:  # noqa: BLE001
        # Defensive: jede andere Exception soll den Stream nicht killen.
        logger.exception("Auto-Cluster: unexpected layout error")
        yield _sse("layout_failed", {
            "error": str(exc),
            "message": "Layout-Phase fehlgeschlagen, Cluster sind "
                       "trotzdem gespeichert.",
        })


def _build_prompt(folder_hint: str, batch: list[str]) -> str:
    folder_ctx = ""
    if folder_hint:
        folder_ctx = (
            f"These concepts come from the folder '{folder_hint}'. "
            "Use this as context for grouping, but create "
            "sub-groups if the topics differ.\n\n"
        )
    return (
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


@router.get("/auto-cluster/stream")
async def auto_cluster_stream(
    request: Request,
    db: Session = Depends(get_db),
):
    """SSE-Stream: Auto-Cluster mit Batch-Fortschritt.

    Forward-Progress-Pattern: alte Cluster bleiben live bis der
    komplette Run durch ist. Cancel oder Crash laesst die alten
    Cluster intakt, die neuen Vorschlaege werden verworfen.

    Parallelisierung: Bounded concurrency via Semaphore. Events
    werden via as_completed sofort beim Fertigwerden eines Batches
    gestreamt, nicht erst am Ende.
    """

    async def generate():
        concepts = db.query(Concept).all()
        if len(concepts) < 3:
            yield _sse("complete", {"clusters": 0, "message": "Zu wenige Konzepte"})
            return

        name_to_id = {c.name: c.id for c in concepts}
        concept_folder = _build_concept_folder_map(db)
        batches = _build_folder_batches(concepts, concept_folder, db)

        # Filter: zu kleine Batches direkt ausschliessen
        active_batches = [
            (i, fh, b) for i, (fh, b) in enumerate(batches) if len(b) >= 2
        ]
        total_batches = len(active_batches)
        start = time.time()
        all_clusters: dict[str, list[str]] = {}

        yield _sse("status", {
            "batches": total_batches,
            "concepts": len(concepts),
            "concurrency": CLUSTER_CONCURRENCY,
        })

        if total_batches == 0:
            yield _sse("complete", {
                "clusters": 0,
                "batches": 0,
                "total_concepts": len(concepts),
                "elapsed": 0.0,
            })
            return

        sem = asyncio.Semaphore(CLUSTER_CONCURRENCY)
        cancel_flag = {"cancelled": False}

        async def process_batch(idx: int, folder_hint: str, batch: list[str]):
            """Ein einzelner Batch: LLM-Call + Parse. Gibt (idx, parsed, provider, err) zurueck."""
            async with sem:
                if cancel_flag["cancelled"]:
                    return (idx, folder_hint, None, None, "cancelled")
                try:
                    prompt = _build_prompt(folder_hint, batch)
                    raw, provider = await ai_chat_with_provider(
                        prompt, page="metis", disable_groq=True,
                    )
                    parsed = parse_json_response(raw)
                    return (idx, folder_hint, parsed, provider, None)
                except Exception as e:
                    return (idx, folder_hint, None, None, str(e)[:200])

        # Tasks parallel starten
        tasks = [
            asyncio.create_task(process_batch(idx, fh, b))
            for idx, fh, b in active_batches
        ]

        done_count = 0
        try:
            for coro in asyncio.as_completed(tasks):
                # Periodischer Cancel-Check zwischen Batch-Completions
                if await request.is_disconnected():
                    cancel_flag["cancelled"] = True
                    for t in tasks:
                        if not t.done():
                            t.cancel()
                    logger.info(
                        f"Auto-Cluster cancelled after {done_count}/{total_batches} "
                        "— old clusters preserved (forward-progress)"
                    )
                    yield _sse("cancelled", {
                        "done": done_count, "total": total_batches,
                        "elapsed": round(time.time() - start, 1),
                    })
                    return

                idx, folder_hint, parsed, provider, err = await coro
                done_count += 1

                if err:
                    if err == "cancelled":
                        # Task hat self-cancelled durch cancel_flag
                        continue
                    logger.warning(f"Cluster Batch {idx+1} fehlgeschlagen: {err}")
                    yield _sse("batch_error", {
                        "batch": idx + 1, "done": done_count,
                        "total": total_batches, "error": err,
                    })
                    continue

                # Parsed Ergebnis in all_clusters mergen
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
                    "batch": idx + 1,
                    "done": done_count, "total": total_batches,
                    "clusters_in_batch": batch_clusters,
                    "total_clusters": len(all_clusters),
                    "provider": provider,
                    "elapsed": round(time.time() - start, 1),
                })
        except asyncio.CancelledError:
            # Defensive: falls einer der Tasks unerwartet cancelt
            logger.warning("Auto-Cluster: unexpected CancelledError in main loop")
            raise

        # Final-Cancel-Check vor dem destruktiven Swap
        if await request.is_disconnected():
            logger.info("Auto-Cluster cancelled before commit — old clusters preserved")
            yield _sse("cancelled", {
                "done": done_count, "total": total_batches,
                "elapsed": round(time.time() - start, 1),
            })
            return

        # Atomic Swap: alte Cluster loeschen + neue speichern in einer Transaktion
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
        # Neue Cluster-Labels existieren jetzt — Cache fuer
        # Phantom-Concept-Filter invalidieren damit naechste
        # Concept-Extraction die neuen Labels kennt.
        invalidate_cluster_label_cache()
        clusters_elapsed = round(time.time() - start, 1)
        yield _sse("clusters_done", {
            "clusters": count,
            "batches": total_batches,
            "total_concepts": len(concepts),
            "elapsed": clusters_elapsed,
        })

        # ===== Phase 2: Cluster-Layout neu berechnen =====
        # Logik in _layout_phase_events() gekapselt damit dieser
        # Stream-Generator fokussiert auf Cluster-Orchestrierung bleibt.
        async for evt in _layout_phase_events(request):
            yield evt

        # Final: Gesamt-Status (backwards-compatible, Frontend hoert hier)
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
