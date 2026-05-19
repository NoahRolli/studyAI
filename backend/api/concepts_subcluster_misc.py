# Concepts Subcluster Misc v3 — Embedding-First Pipeline
#
# Architektur v3:
# 1. Pro Misc-Cluster: Embeddings laden → Average-Link Clustering (numpy)
# 2. Mikro-Cluster (3+ members) → LLM-Label-Phase (Batch parallel)
# 3. Commit zur DB + Layout-Recompute

import asyncio
import json
import logging
import random
import time

import numpy as np
from sqlalchemy.orm import Session

from backend.models.concept import (
    Concept, ConceptCluster, ConceptClusterMember,
)
from backend.api.concepts_ai import invalidate_cluster_label_cache
from backend.api.concepts_subcluster_helpers import (
    label_all_microclusters,
    _redistribute_unassigned,
    _load_regular_centroids,
)
from backend.services.concept_hierarchical_cluster import (
    average_link_cluster,
)

logger = logging.getLogger(__name__)

UNASSIGNED_LABEL = "Unassigned"
# Cosine-Distance Threshold fuer Cluster-Bildung
# 0.50 = entspricht Cosine-Sim 0.50 (Journal-Pattern aus Memory)
CLUSTER_THRESHOLD_DIST = 0.50
MIN_SUB_CLUSTER_SIZE = 3


def _parse_embedding(raw: str | None) -> np.ndarray | None:
    """JSON-String → numpy array."""
    if not raw:
        return None
    try:
        vec = json.loads(raw)
        if isinstance(vec, list):
            return np.array(vec, dtype=np.float32)
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _load_cluster_embeddings(
    db: Session, cluster_id: int,
) -> tuple[np.ndarray, list[str]]:
    """Laedt alle Member-Embeddings + Namen fuer einen Cluster.

    Returns:
        (embeddings_matrix (N, D), concept_names) — gleiche Reihenfolge.
        Concepts ohne Embedding werden geskippt + geloggt.
    """
    members = db.query(ConceptClusterMember).filter_by(
        cluster_id=cluster_id
    ).all()

    valid_vecs = []
    valid_names = []
    skipped = 0
    for m in members:
        concept = db.query(Concept).filter_by(id=m.concept_id).first()
        if concept is None:
            skipped += 1
            continue
        vec = _parse_embedding(concept.embedding)
        if vec is None:
            skipped += 1
            continue
        valid_vecs.append(vec)
        valid_names.append(concept.name)

    if skipped:
        logger.warning(
            f"Cluster {cluster_id}: {skipped} concepts ohne valides Embedding"
        )

    if not valid_vecs:
        return np.zeros((0, 1024), dtype=np.float32), []

    matrix = np.stack(valid_vecs)
    return matrix, valid_names


async def _plan_themed_misc(
    db: Session,
    cluster: ConceptCluster,
    sample_size: int | None = None,
) -> dict[str, list[str]]:
    """Verarbeitet einen themed Misc-Cluster komplett:
    1. Embeddings laden
    2. Average-Link Clustering
    3. LLM-Labels fuer Mikro-Cluster

    Returns: {new_label: [concept_name, ...]}
    """
    t0 = time.time()
    embeddings, names = _load_cluster_embeddings(db, cluster.id)
    n = len(names)
    if n == 0:
        return {}

    # Sample-Mode fuer Tests
    if sample_size and sample_size < n:
        random.seed(42)
        indices = random.sample(range(n), sample_size)
        embeddings = embeddings[indices]
        names = [names[i] for i in indices]
        n = sample_size
        logger.info(
            f"Cluster {cluster.id} '{cluster.label}': "
            f"SAMPLE {sample_size}/{len(_load_cluster_embeddings(db, cluster.id)[1])}"
        )
    else:
        logger.info(
            f"Cluster {cluster.id} '{cluster.label}': {n} concepts loaded"
        )

    # 1. Hierarchical Clustering
    t_cluster = time.time()
    micro_clusters = average_link_cluster(
        embeddings,
        threshold_distance=CLUSTER_THRESHOLD_DIST,
        min_cluster_size=MIN_SUB_CLUSTER_SIZE,
    )
    logger.info(
        f"Cluster {cluster.id}: clustered into {len(micro_clusters)} "
        f"micro-clusters in {time.time() - t_cluster:.1f}s"
    )

    # 2. Concept-Namen pro Mikro-Cluster sammeln
    cluster_name_lists = []
    for micro in micro_clusters:
        cluster_name_lists.append([names[idx] for idx in micro])

    # 3. LLM-Labels parallel
    t_label = time.time()
    labels = await label_all_microclusters(
        cluster.label, cluster_name_lists, concurrency=2,
    )
    logger.info(
        f"Cluster {cluster.id}: labeled {len(labels)} micro-clusters "
        f"in {time.time() - t_label:.1f}s"
    )

    # 4. Final plan zusammenstellen
    final_plan: dict[str, list[str]] = {}
    for label, member_names in zip(labels, cluster_name_lists):
        if label in final_plan:
            # Duplikat (shouldn't happen wegen Disambiguation, safety net)
            final_plan[label].extend(member_names)
        else:
            final_plan[label] = list(member_names)

    elapsed = time.time() - t0
    total = sum(len(m) for m in final_plan.values())
    logger.info(
        f"Cluster {cluster.id} '{cluster.label}' done in {elapsed:.1f}s: "
        f"{len(final_plan)} sub-clusters, {total} members "
        f"(coverage {100*total/n:.0f}%)"
    )
    return final_plan


async def build_plan(db: Session, sample_size: int | None = None) -> dict:
    """PLAN-Phase: Berechnet Sub-Cluster-Plan, schreibt nichts in die DB."""
    misc_clusters = db.query(ConceptCluster).filter(
        (ConceptCluster.label.like("% - Other"))
        | (ConceptCluster.label == UNASSIGNED_LABEL)
    ).all()
    misc_cluster_ids = {c.id for c in misc_clusters}

    unassigned_cluster = next(
        (c for c in misc_clusters if c.label == UNASSIGNED_LABEL), None
    )
    themed_clusters = [c for c in misc_clusters if c.label != UNASSIGNED_LABEL]

    logger.info(
        f"Plan: {len(themed_clusters)} themed Misc + "
        f"{'1' if unassigned_cluster else '0'} Unassigned "
        f"{f'(SAMPLE={sample_size})' if sample_size else '(FULL)'}"
    )

    themed_plan: dict[int, dict[str, list[str]]] = {}
    for cluster in themed_clusters:
        sub = await _plan_themed_misc(db, cluster, sample_size)
        themed_plan[cluster.id] = sub

    unassigned_redistrib: dict[int, list[int]] = {}
    if unassigned_cluster is not None and sample_size is None:
        centroids = _load_regular_centroids(db, misc_cluster_ids)
        unassigned_redistrib = _redistribute_unassigned(
            db, unassigned_cluster.id, centroids,
        )

    return {
        "themed": themed_plan,
        "unassigned_redistrib": unassigned_redistrib,
        "misc_cluster_ids": misc_cluster_ids,
        "unassigned_cluster_id": (
            unassigned_cluster.id if unassigned_cluster else None
        ),
        "sample_mode": sample_size is not None,
    }


def commit_plan(db: Session, plan: dict, name_to_id: dict[str, int]) -> dict:
    """COMMIT-Phase: Persistiert den Plan."""
    stats = {
        "themed_deleted": 0, "sub_clusters_created": 0,
        "members_assigned": 0,
        "unassigned_redistributed": 0, "unassigned_deleted": False,
    }

    for old_cluster_id, sub_plan in plan["themed"].items():
        db.query(ConceptClusterMember).filter_by(
            cluster_id=old_cluster_id
        ).delete()
        db.query(ConceptCluster).filter_by(id=old_cluster_id).delete()
        stats["themed_deleted"] += 1

        for new_label, concept_names in sub_plan.items():
            new_cluster = ConceptCluster(label=new_label)
            db.add(new_cluster)
            db.flush()
            stats["sub_clusters_created"] += 1
            for name in concept_names:
                cid = name_to_id.get(name)
                if cid is None:
                    continue
                db.add(ConceptClusterMember(
                    cluster_id=new_cluster.id, concept_id=cid,
                ))
                stats["members_assigned"] += 1

    unassigned_id = plan["unassigned_cluster_id"]
    if unassigned_id is not None:
        db.query(ConceptClusterMember).filter_by(
            cluster_id=unassigned_id
        ).delete()
        for target_id, concept_ids in plan["unassigned_redistrib"].items():
            for cid in concept_ids:
                existing = db.query(ConceptClusterMember).filter_by(
                    cluster_id=target_id, concept_id=cid,
                ).first()
                if existing is None:
                    db.add(ConceptClusterMember(
                        cluster_id=target_id, concept_id=cid,
                    ))
                    stats["unassigned_redistributed"] += 1
        db.query(ConceptCluster).filter_by(id=unassigned_id).delete()
        stats["unassigned_deleted"] = True

    db.commit()
    invalidate_cluster_label_cache()
    return stats
