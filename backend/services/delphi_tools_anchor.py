"""Anker-Resolution fuer Delphi-Tools.

Topic-String -> Top-1 Concept (Embedding-Match) -> Top-Cluster
(Centroid-Cosine zum Query) -> Concept-IDs fuer Source-Lookup.

Bei zu schwacher Similarity, fehlendem Cluster oder zu kleinem Cluster
Fallback auf Top-K-Embedding-Match.
"""
import json
import logging
import numpy as np
from sqlalchemy.orm import Session

import backend.models.registry  # noqa: F401  Lazy-loads ALLE Models.

from backend.models.concept import ConceptCluster, ConceptClusterMember
from backend.services.embedding_service import generate_embedding
from backend.services.delphi_retrieval_cache import get_embedding_cache


logger = logging.getLogger(__name__)


# ---------- Konfig ----------
TIMELINE_TOP_K_CONCEPTS = 30   # Mehr als bei Standard-Retrieval — wir
                                # wollen Spannweite, nicht Praezision
ANCHOR_MIN_SIMILARITY = 0.5         # Top-1 muss diese Similarity erreichen,
                                    # sonst kein Cluster-Filter (Fallback)
MIN_CLUSTER_CONCEPTS = 3            # Mini-Cluster -> Fallback statt zu eng
MIN_CLUSTER_CENTROID_SIM = 0.5      # Wenn der gewaehlte Cluster zu weit
                                    # weg vom Query-Embedding ist, lieber
                                    # Top-K-Fallback statt fehlfokussiert


# ---------- Helper: Topic -> Cluster-Anker ----------
async def _resolve_topic_anchor(
    db: Session,
    topic: str,
) -> tuple[list[int] | None, dict]:
    """Topic-String -> (concept_ids fuer Source-Lookup, anchor_info).

    Strategie:
    1) Top-1 Concept via Embedding-Match.
    2) Dessen Cluster-Memberships lookuppen (n:m moeglich).
    3) Falls Cluster mit >= MIN_CLUSTER_CONCEPTS existiert:
       returne alle Concepts dieser Cluster (thematisch gefiltert).
    4) Sonst Fallback: Top-K Concepts wie bisher.

    Returns:
        concept_ids: Liste der Concept-IDs fuer ConceptSource-Filter,
                     oder None bei leerem Embedding-Cache.
        anchor_info: Transparenz-Dict (anchor_name, anchor_similarity,
                     cluster_filter_applied, cluster_labels,
                     cluster_concept_count).
    """
    info: dict = {
        "anchor_name": None,
        "anchor_similarity": 0.0,
        "cluster_filter_applied": False,
        "cluster_labels": [],
        "cluster_concept_count": 0,
        "cluster_centroid_sim": 0.0,
    }

    # 1) Topic-Embedding
    query_vec = await generate_embedding(topic)
    q = np.asarray(query_vec, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm < 1e-9:
        return None, info
    q = q / q_norm

    # 2) Top-K Concepts (Fallback braucht die sowieso)
    matrix, ids, names = await get_embedding_cache(db)
    if matrix.shape[0] == 0:
        return None, info
    scores = matrix @ q
    k = min(TIMELINE_TOP_K_CONCEPTS, scores.shape[0])
    top_idx = np.argpartition(-scores, k - 1)[:k]
    fallback_ids = ids[top_idx].tolist()

    # 3) Echtes Top-1 fuer Anker (argpartition ist nicht sortiert).
    #    best_local indexiert top_idx, top_idx[best_local] ist global.
    #    names ist eine Liste, deshalb Skalar-Index statt Array-Index.
    best_local = int(np.argmax(scores[top_idx]))
    anchor_global_idx = int(top_idx[best_local])
    anchor_concept_id = int(ids[anchor_global_idx])
    anchor_similarity = float(scores[anchor_global_idx])
    info["anchor_name"] = str(names[anchor_global_idx])
    info["anchor_similarity"] = anchor_similarity

    # 4) Similarity-Cutoff
    if anchor_similarity < ANCHOR_MIN_SIMILARITY:
        return fallback_ids, info

    # 5) Cluster-Memberships des Ankers (n:m moeglich)
    cluster_ids = [
        r[0] for r in db.query(ConceptClusterMember.cluster_id).filter(
            ConceptClusterMember.concept_id == anchor_concept_id
        ).all()
    ]
    if not cluster_ids:
        return fallback_ids, info

    # 6) Top-Cluster waehlen via Centroid-Cosine zum Query.
    #    Bei n:m wuerde "alle nehmen" den Filter aufweichen — wir wollen
    #    den thematisch passendsten Cluster, nicht alle.
    cluster_rows = db.query(
        ConceptCluster.id, ConceptCluster.label, ConceptCluster.centroid_text
    ).filter(ConceptCluster.id.in_(cluster_ids)).all()

    best: tuple[int, str, float] | None = None  # (cluster_id, label, sim)
    for cl_id, cl_label, centroid_text in cluster_rows:
        if not centroid_text:
            continue
        try:
            cv = np.asarray(json.loads(centroid_text), dtype=np.float32)
        except (ValueError, TypeError):
            continue
        if cv.shape != q.shape:
            continue
        cv_norm = np.linalg.norm(cv)
        if cv_norm < 1e-9:
            continue
        sim = float(np.dot(q, cv / cv_norm))
        if best is None or sim > best[2]:
            best = (cl_id, cl_label, sim)

    if best is None or best[2] < MIN_CLUSTER_CENTROID_SIM:
        # Cluster-Centroid zu weit weg oder kaputter Centroid -> Fallback
        return fallback_ids, info

    best_cluster_id, best_cluster_label, best_centroid_sim = best

    # 7) Concepts NUR aus dem gewaehlten Cluster
    cluster_concept_ids = [
        r[0] for r in db.query(ConceptClusterMember.concept_id).filter(
            ConceptClusterMember.cluster_id == best_cluster_id
        ).distinct().all()
    ]
    if len(cluster_concept_ids) < MIN_CLUSTER_CONCEPTS:
        return fallback_ids, info

    info["cluster_filter_applied"] = True
    info["cluster_labels"] = [best_cluster_label]
    info["cluster_concept_count"] = len(cluster_concept_ids)
    info["cluster_centroid_sim"] = best_centroid_sim
    return cluster_concept_ids, info
