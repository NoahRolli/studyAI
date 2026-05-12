# Concepts Cluster Stream — SSE fuer Auto-Cluster mit Live-Progress
# Zeigt Batch-Fortschritt, Provider, neue Cluster pro Batch
#
# Bulk-Workload-Pattern:
# - disable_groq=True (vermeidet 429-Pingpong bei hunderten Calls)
# - Forward-Progress: alte Cluster bleiben bis neue fertig sind
# - Cancel-Detection: bricht sauber ab wenn Frontend SSE schliesst
# - Parallelisierung: Semaphore(2) bounded concurrency + as_completed
#
# Coverage-Garantie (Chat 73):
# - _build_prompt + _parse_batch_response in concepts_cluster_helpers
# - Misc-Cluster-Fallback fuer LLM-gedropte Concepts
# - dry_run-Query-Param fuer DB-freie Test-Laeufe

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
from backend.api.concepts_cluster_helpers import (
    _build_prompt, _parse_batch_response,
)

# Phase 2: nach Cluster-Persistierung automatisch Layout neu berechnen.
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
# aber Dispatch-Overhead + JSON-Parsing parallelisiert.
CLUSTER_CONCURRENCY = 2

# Mindestgroesse fuer regulaere Cluster. Kleinere werden in
# _Misc_<folder>-Cluster zusammengelegt anstatt verworfen.
MIN_CLUSTER_SIZE = 2


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _layout_phase_events(request):
    """Phase 2 nach Cluster-Persistierung: Centroids + Force-Sim neu berechnen.

    Yielded SSE-Events fuer Live-Progress. Faengt Cancel und Exceptions
    intern ab. Crasht nie nach aussen (Cluster sind bereits committed).
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
        logger.error(f"Auto-Cluster: layout phase failed: {exc}")
        yield _sse("layout_failed", {
            "error": str(exc),
            "message": "Cluster gespeichert, aber Layout-Compute "
                       "fehlgeschlagen. Manuell ausloesen via "
                       "scripts/compute_sphere_layout.py.",
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("Auto-Cluster: unexpected layout error")
        yield _sse("layout_failed", {
            "error": str(exc),
            "message": "Layout-Phase fehlgeschlagen, Cluster sind "
                       "trotzdem gespeichert.",
        })


@router.get("/auto-cluster/stream")
async def auto_cluster_stream(
    request: Request,
    db: Session = Depends(get_db),
):
    """SSE-Stream: Auto-Cluster mit Batch-Fortschritt.

    Forward-Progress-Pattern: alte Cluster bleiben live bis der
    komplette Run durch ist. Cancel oder Crash laesst die alten
    Cluster intakt.

    Coverage-Garantie: Pro Batch gehen 100% der Input-Concepts in
    einen Cluster. Vom LLM gedropte Concepts landen im Misc-Cluster
    des jeweiligen Folders.

    Query-Param dry_run=1 ueberspringt destruktiven Swap.
    """
    dry_run = request.query_params.get("dry_run", "").lower() in ("1", "true", "yes")

    async def generate():
        concepts = db.query(Concept).all()
        if len(concepts) < 3:
            yield _sse("complete", {"clusters": 0, "message": "Zu wenige Konzepte"})
            return

        name_to_id = {c.name: c.id for c in concepts}
        concept_folder = _build_concept_folder_map(db)
        batches = _build_folder_batches(concepts, concept_folder, db)

        active_batches = [
            (i, fh, b) for i, (fh, b) in enumerate(batches) if len(b) >= 2
        ]
        total_batches = len(active_batches)
        start = time.time()
        all_clusters: dict[str, list[str]] = {}
        # Misc-Cluster pro Folder: folder_hint -> [canonical_name, ...]
        misc_by_folder: dict[str, list[str]] = {}
        total_input_concepts = sum(len(b) for _, _, b in active_batches)
        total_assigned = 0
        total_missing = 0

        yield _sse("status", {
            "batches": total_batches,
            "concepts": len(concepts),
            "concurrency": CLUSTER_CONCURRENCY,
            "dry_run": dry_run,
        })

        if total_batches == 0:
            yield _sse("complete", {
                "clusters": 0, "batches": 0,
                "total_concepts": len(concepts), "elapsed": 0.0,
            })
            return

        sem = asyncio.Semaphore(CLUSTER_CONCURRENCY)
        cancel_flag = {"cancelled": False}

        async def process_batch(idx: int, folder_hint: str, batch: list[str]):
            """LLM-Call + Parse fuer einen Batch."""
            async with sem:
                if cancel_flag["cancelled"]:
                    return (idx, folder_hint, batch, None, None, "cancelled")
                try:
                    prompt = _build_prompt(folder_hint, batch)
                    raw, provider = await ai_chat_with_provider(
                        prompt, page="metis", disable_groq=True,
                    )
                    parsed = parse_json_response(raw)
                    return (idx, folder_hint, batch, parsed, provider, None)
                except Exception as e:
                    return (idx, folder_hint, batch, None, None, str(e)[:200])

        tasks = [
            asyncio.create_task(process_batch(idx, fh, b))
            for idx, fh, b in active_batches
        ]

        done_count = 0
        try:
            for coro in asyncio.as_completed(tasks):
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

                idx, folder_hint, batch_input, parsed, provider, err = await coro
                done_count += 1

                if err:
                    if err == "cancelled":
                        continue
                    logger.warning(f"Cluster Batch {idx+1} fehlgeschlagen: {err}")
                    # Coverage erhalten: alle Inputs in Folder-Misc
                    misc_key = folder_hint or "_no_folder"
                    misc_by_folder.setdefault(misc_key, []).extend(batch_input)
                    total_missing += len(batch_input)
                    yield _sse("batch_error", {
                        "batch": idx + 1, "done": done_count,
                        "total": total_batches, "error": err,
                        "fallback_to_misc": len(batch_input),
                    })
                    continue

                batch_clusters, missing = _parse_batch_response(
                    parsed, batch_input, name_to_id,
                )

                batch_cluster_count = 0
                for label_lower, members in batch_clusters.items():
                    # Misc-Labels aus LLM-Output direkt in Folder-Misc
                    if label_lower.startswith("_misc") or label_lower == "misc":
                        misc_key = folder_hint or "_no_folder"
                        misc_by_folder.setdefault(misc_key, []).extend(members)
                        continue
                    if label_lower not in all_clusters:
                        all_clusters[label_lower] = []
                    for name in members:
                        if name not in all_clusters[label_lower]:
                            all_clusters[label_lower].append(name)
                    batch_cluster_count += 1

                if missing:
                    misc_key = folder_hint or "_no_folder"
                    misc_by_folder.setdefault(misc_key, []).extend(missing)

                assigned_in_batch = len(batch_input) - len(missing)
                total_assigned += assigned_in_batch
                total_missing += len(missing)

                yield _sse("batch_done", {
                    "batch": idx + 1,
                    "done": done_count, "total": total_batches,
                    "clusters_in_batch": batch_cluster_count,
                    "total_clusters": len(all_clusters),
                    "batch_size": len(batch_input),
                    "assigned": assigned_in_batch,
                    "missing": len(missing),
                    "coverage_pct": round(
                        100.0 * assigned_in_batch / max(len(batch_input), 1), 1,
                    ),
                    "provider": provider,
                    "folder": folder_hint or None,
                    "elapsed": round(time.time() - start, 1),
                })
        except asyncio.CancelledError:
            logger.warning("Auto-Cluster: unexpected CancelledError in main loop")
            raise

        if await request.is_disconnected():
            logger.info("Auto-Cluster cancelled before commit — old clusters preserved")
            yield _sse("cancelled", {
                "done": done_count, "total": total_batches,
                "elapsed": round(time.time() - start, 1),
            })
            return

        # Pre-Commit-Summary mit Coverage-Stats
        misc_total = sum(len(v) for v in misc_by_folder.values())
        yield _sse("coverage_summary", {
            "input_total": total_input_concepts,
            "assigned": total_assigned,
            "missing": total_missing,
            "misc_buckets": len(misc_by_folder),
            "misc_total": misc_total,
            "coverage_pct": round(
                100.0 * total_assigned / max(total_input_concepts, 1), 1,
            ),
        })

        if dry_run:
            logger.info(
                f"Auto-Cluster DRY-RUN: {len(all_clusters)} regular clusters + "
                f"{len(misc_by_folder)} misc buckets, "
                f"coverage {total_assigned}/{total_input_concepts}"
            )
            yield _sse("complete", {
                "clusters": len(all_clusters),
                "misc_clusters": len(misc_by_folder),
                "batches": total_batches,
                "total_concepts": len(concepts),
                "elapsed": round(time.time() - start, 1),
                "dry_run": True,
            })
            return

        # Atomic Swap: alte Cluster loeschen + neue speichern
        db.query(ConceptClusterMember).delete()
        db.query(ConceptCluster).delete()
        db.flush()

        count = 0
        for label, members in all_clusters.items():
            if len(members) < MIN_CLUSTER_SIZE:
                # Unter Mindestgroesse -> in Folder-Misc verschieben
                misc_by_folder.setdefault("_no_folder", []).extend(members)
                continue
            cluster = ConceptCluster(label=label.title())
            db.add(cluster)
            db.flush()
            for name in members:
                if name not in name_to_id:
                    continue
                db.add(ConceptClusterMember(
                    cluster_id=cluster.id,
                    concept_id=name_to_id[name],
                ))
            count += 1

        # Misc-Cluster pro Folder persistieren
        misc_count = 0
        for folder_key, members in misc_by_folder.items():
            unique_members = list(dict.fromkeys(members))
            if not unique_members:
                continue
            label = f"_Misc_{folder_key}"
            cluster = ConceptCluster(label=label)
            db.add(cluster)
            db.flush()
            for name in unique_members:
                if name not in name_to_id:
                    continue
                db.add(ConceptClusterMember(
                    cluster_id=cluster.id,
                    concept_id=name_to_id[name],
                ))
            misc_count += 1

        db.commit()
        invalidate_cluster_label_cache()
        clusters_elapsed = round(time.time() - start, 1)
        yield _sse("clusters_done", {
            "clusters": count,
            "misc_clusters": misc_count,
            "batches": total_batches,
            "total_concepts": len(concepts),
            "elapsed": clusters_elapsed,
        })

        async for evt in _layout_phase_events(request):
            yield evt

        yield _sse("complete", {
            "clusters": count,
            "misc_clusters": misc_count,
            "batches": total_batches,
            "total_concepts": len(concepts),
            "elapsed": round(time.time() - start, 1),
        })

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
