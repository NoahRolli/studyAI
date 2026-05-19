# Concept Hierarchical Clustering — Average-Link, Lance-Williams, Heap
#
# Skalierbare Variante des Journal-Clustering-Patterns:
# - Naive O(N^3) bei Journal (n<200, ok)
# - Hier O(N^2 log N) noetig fuer 1817+ Concepts in Pallas-Misc
#
# Algorithmus:
# 1. Cosine-Distance-Matrix vorrechnen (numpy: 1 - normalized @ normalized.T)
# 2. Min-Heap mit allen Paaren (i, j, dist)
# 3. Pop kleinstes Paar, merge, update Distanzen via Lance-Williams:
#    d(merged, k) = (|i| * d(i, k) + |j| * d(j, k)) / (|i| + |j|)
# 4. Lazy-Deletion im Heap: tote Eintraege beim Pop ueberspringen
# 5. Stoppe bei min_dist > threshold

import heapq
import logging
import numpy as np

logger = logging.getLogger(__name__)


def _normalize_rows(matrix: np.ndarray) -> np.ndarray:
    """L2-Normalisierung pro Zeile. Damit ist matrix @ matrix.T = Cosine-Sim."""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # Schutz gegen Zero-Vectors
    return matrix / norms


def average_link_cluster(
    embeddings: np.ndarray,
    threshold_distance: float = 0.50,
    min_cluster_size: int = 3,
) -> list[list[int]]:
    """Average-Link Hierarchical Clustering via Lance-Williams + Heap.

    Args:
        embeddings: (N, D) array. Wird automatisch L2-normalisiert.
        threshold_distance: Stop-Threshold in Cosine-Distance (1 - cos_sim).
                            0.45 = sehr aehnlich (cos_sim >= 0.55)
                            0.55 = mittel (cos_sim >= 0.45)
        min_cluster_size: Cluster mit weniger Members werden in Nachbar gemergt

    Returns:
        Liste von Clustern, jeder = Liste von Original-Indices in embeddings.
        Coverage: jeder Index erscheint in genau einem Cluster (vor Filter).
    """
    n = embeddings.shape[0]
    if n == 0:
        return []
    if n == 1:
        # Edge-Case: single Concept — bleibt allein, wird in Caller-Schicht
        # gemergt oder geskippt
        return [[0]]

    # 1. Distance-Matrix vorrechnen
    normalized = _normalize_rows(embeddings.astype(np.float32))
    sim_matrix = normalized @ normalized.T  # (N, N) cosine sim
    dist_matrix = 1.0 - sim_matrix
    # Numerische Saeuberung: Diagonale auf inf damit nie self-matched wird
    np.fill_diagonal(dist_matrix, np.inf)

    # 2. Min-Heap: (distance, i, j, version_i, version_j)
    # Version-Counter erlauben Lazy-Deletion (siehe unten)
    heap = []
    for i in range(n):
        for j in range(i + 1, n):
            heapq.heappush(heap, (float(dist_matrix[i, j]), i, j, 0, 0))

    # 3. Cluster-Tracking
    # active[i] = True wenn Cluster i noch lebt (nicht in anderen gemergt)
    active = np.ones(n, dtype=bool)
    # cluster_members[i] = list of original indices in dieser Cluster
    cluster_members: dict[int, list[int]] = {i: [i] for i in range(n)}
    # cluster_sizes[i] = |cluster i|
    cluster_sizes = np.ones(n, dtype=np.int32)
    # versions[i] = wie oft Cluster i geupdated wurde (Lazy-Delete-Marker)
    versions = np.zeros(n, dtype=np.int32)

    # 4. Main Merge-Loop
    merge_count = 0
    while heap and active.sum() > 1:
        try:
            dist, i, j, v_i, v_j = heapq.heappop(heap)
        except IndexError:
            break

        # Lazy-Delete: wenn versions inzwischen anders, Eintrag ist tot
        if not active[i] or not active[j]:
            continue
        if v_i != versions[i] or v_j != versions[j]:
            continue

        # Stop-Condition: keine Paare mehr nah genug
        if dist > threshold_distance:
            break

        # Merge j into i (i ist "Survivor", j wird geschluckt)
        cluster_members[i].extend(cluster_members[j])
        size_i = cluster_sizes[i]
        size_j = cluster_sizes[j]
        new_size = size_i + size_j

        # Lance-Williams Update: alle Distanzen i↔k aktualisieren
        # neue d(i, k) = (size_i * d(i, k) + size_j * d(j, k)) / (size_i + size_j)
        for k in range(n):
            if k == i or k == j or not active[k]:
                continue
            new_d = (size_i * dist_matrix[i, k] + size_j * dist_matrix[j, k]) / new_size
            dist_matrix[i, k] = new_d
            dist_matrix[k, i] = new_d

        cluster_sizes[i] = new_size
        versions[i] += 1
        active[j] = False
        del cluster_members[j]

        # Neue Paare (i, *) im Heap pushen mit aktueller Version
        for k in range(n):
            if k == i or not active[k]:
                continue
            heapq.heappush(
                heap, (float(dist_matrix[i, k]), i, k, versions[i], versions[k])
            )

        merge_count += 1

    # 5. Resultat: alle lebenden Cluster
    raw_clusters = [members for cid, members in cluster_members.items()]

    # Coverage-Sanity-Check
    flat = [idx for c in raw_clusters for idx in c]
    if len(flat) != n or set(flat) != set(range(n)):
        logger.error(
            f"Coverage-Bug: {len(flat)} indices vs {n} expected, "
            f"merge_count={merge_count}"
        )

    # Mini-Cluster (<min_cluster_size) in groesseren Nachbarn mergen
    if min_cluster_size > 1:
        big = [c for c in raw_clusters if len(c) >= min_cluster_size]
        small = [c for c in raw_clusters if len(c) < min_cluster_size]
        if small and big:
            # Pro kleinem Cluster: naechsten grossen via Member-zu-Centroid finden
            for small_cluster in small:
                small_embs = embeddings[small_cluster]
                small_centroid = _normalize_rows(small_embs.mean(axis=0, keepdims=True))[0]
                best_idx = -1
                best_sim = -1.0
                for idx, big_cluster in enumerate(big):
                    big_embs = embeddings[big_cluster]
                    big_centroid = _normalize_rows(big_embs.mean(axis=0, keepdims=True))[0]
                    sim = float(small_centroid @ big_centroid)
                    if sim > best_sim:
                        best_sim = sim
                        best_idx = idx
                if best_idx >= 0:
                    big[best_idx].extend(small_cluster)
            raw_clusters = big
        elif not big:
            # Alle Cluster zu klein — keep all (Edge-Case)
            logger.warning(
                f"Alle {len(raw_clusters)} Cluster <{min_cluster_size} — "
                "keep all"
            )

    logger.info(
        f"Average-Link done: n={n}, merges={merge_count}, "
        f"final_clusters={len(raw_clusters)}, "
        f"threshold={threshold_distance}"
    )
    return raw_clusters
