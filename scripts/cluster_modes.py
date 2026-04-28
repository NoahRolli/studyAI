#!/usr/bin/env python3
# scripts/cluster_modes.py
# Drei Modi fuer Cluster-Generierung (rebuild, incremental, merge).
# Entry-Point: cluster_concepts.py

import json
import logging
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import backend.models.registry  # noqa: F401
from backend.models.database import SessionLocal
from backend.models.concept import (
    Concept, ConceptCluster, ConceptClusterMember,
)
from backend.api.concepts_cluster import (
    _build_concept_folder_map, _build_folder_batches,
)
from backend.api.concepts_ai import ai_chat_with_provider, parse_json_response

log = logging.getLogger("cluster")


async def _process_batches(
    batches: list[tuple[str, list[str]]],
    name_to_id: dict[str, int],
) -> dict[str, list[str]]:
    """LLM-Batch-Loop: schickt jeden Batch an Ollama, sammelt Cluster."""
    all_clusters: dict[str, list[str]] = {}
    total = len(batches)
    start = time.time()

    for i, (folder_hint, batch) in enumerate(batches, start=1):
        if len(batch) < 2:
            continue

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
            raw, provider = await ai_chat_with_provider(prompt, page="metis")
            parsed = parse_json_response(raw)
            batch_count = 0
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
                    batch_count += 1
            elapsed = time.time() - start
            log.info(
                f"  batch {i}/{total} [{folder_hint or '-'}] "
                f"+{batch_count} clusters via {provider} ({elapsed:.0f}s)"
            )
        except Exception as e:
            log.warning(f"  batch {i}/{total} FAILED: {str(e)[:120]}")

    return all_clusters


def _save_clusters(
    db, all_clusters: dict[str, list[str]],
    name_to_id: dict[str, int],
) -> int:
    """Cluster + Members in DB persistieren. Returns Count."""
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
    return count


async def run_rebuild() -> int:
    """Modus rebuild: alle Cluster loeschen, alles neu."""
    db = SessionLocal()
    try:
        log.info("=== REBUILD ===")
        concepts = db.query(Concept).all()
        if len(concepts) < 3:
            log.warning("Zu wenige Concepts")
            return 0

        n_old = db.query(ConceptCluster).count()
        n_old_m = db.query(ConceptClusterMember).count()
        log.info(f"Loesche bestehende: {n_old} cluster, {n_old_m} members")
        db.query(ConceptClusterMember).delete()
        db.query(ConceptCluster).delete()
        db.commit()

        name_to_id = {c.name: c.id for c in concepts}
        concept_folder = _build_concept_folder_map(db)
        batches = _build_folder_batches(concepts, concept_folder, db)
        log.info(f"  {len(concepts)} concepts, {len(batches)} batches")

        all_clusters = await _process_batches(batches, name_to_id)
        count = _save_clusters(db, all_clusters, name_to_id)
        log.info(f"=== REBUILD DONE: {count} clusters created ===")
        return count
    finally:
        db.close()


async def run_incremental() -> int:
    """Modus incremental: nur Concepts ohne Cluster neu zuordnen."""
    db = SessionLocal()
    try:
        log.info("=== INCREMENTAL ===")
        all_concepts = db.query(Concept).all()
        clustered_ids = {
            m.concept_id for m in db.query(ConceptClusterMember).all()
        }
        unclustered = [c for c in all_concepts if c.id not in clustered_ids]
        log.info(f"  {len(all_concepts)} total, {len(unclustered)} unclustered")

        if len(unclustered) < 2:
            log.info("Nichts zu tun")
            return 0

        name_to_id = {c.name: c.id for c in all_concepts}
        concept_folder = _build_concept_folder_map(db)
        batches = _build_folder_batches(unclustered, concept_folder, db)
        log.info(f"  {len(batches)} batches")

        all_clusters = await _process_batches(batches, name_to_id)
        count = _save_clusters(db, all_clusters, name_to_id)
        log.info(f"=== INCREMENTAL DONE: {count} new clusters ===")
        return count
    finally:
        db.close()


def run_merge(similarity: float) -> int:
    """Modus merge: Cluster mit aehnlichen Centroiden zusammenfuehren."""
    db = SessionLocal()
    try:
        log.info(f"=== MERGE (similarity >= {similarity}) ===")
        clusters = db.query(ConceptCluster).filter(
            ConceptCluster.centroid_text.isnot(None),
        ).all()
        if len(clusters) < 2:
            log.warning("Zu wenige Cluster mit Centroid")
            return 0

        ids: list[int] = []
        vectors: list[np.ndarray] = []
        for cl in clusters:
            try:
                arr = json.loads(cl.centroid_text)
                if isinstance(arr, list) and len(arr) > 0:
                    vectors.append(np.asarray(arr, dtype=np.float32))
                    ids.append(cl.id)
            except Exception:
                continue
        matrix = np.stack(vectors, axis=0)
        n = matrix.shape[0]
        log.info(f"  {n} clusters geladen")

        # Cosine-Sim Matrix (Centroide normalisiert)
        sim = matrix @ matrix.T
        np.fill_diagonal(sim, -1)

        merged = set()
        merge_count = 0
        flat_sim = sim.flatten()
        order = np.argsort(-flat_sim)
        for flat_idx in order:
            if flat_sim[flat_idx] < similarity:
                break
            i, j = divmod(int(flat_idx), n)
            if i >= j or i in merged or j in merged:
                continue
            cid_a, cid_b = ids[i], ids[j]
            cl_a = next(c for c in clusters if c.id == cid_a)
            cl_b = next(c for c in clusters if c.id == cid_b)
            log.info(f"  merge cl{cid_b}('{cl_b.label}') -> cl{cid_a}('{cl_a.label}') "
                     f"sim={float(sim[i, j]):.3f}")
            existing_a = {m.concept_id for m in db.query(ConceptClusterMember).filter(
                ConceptClusterMember.cluster_id == cid_a,
            ).all()}
            members_b = db.query(ConceptClusterMember).filter(
                ConceptClusterMember.cluster_id == cid_b,
            ).all()
            for m in members_b:
                if m.concept_id in existing_a:
                    db.delete(m)
                else:
                    m.cluster_id = cid_a
            db.delete(cl_b)
            merged.add(j)
            merge_count += 1

        if merge_count > 0:
            db.commit()
        log.info(f"=== MERGE DONE: {merge_count} clusters merged ===")
        return merge_count
    finally:
        db.close()
