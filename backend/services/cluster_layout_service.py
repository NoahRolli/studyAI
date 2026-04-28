# cluster_layout_service.py — Pre-computed Cluster-Layout via numpy Force-Sim
#
# Strategie:
#   1. PCA-Init aus Centroiden
#   2. Force-Sim mit:
#      - Repulsion (vektorisiertes O(n^2), all-pairs)
#      - Edge-Attraktion (sparse, nur Cluster-Edges)
#      - Soft-Boundary statt harter Sphere (organische Form)
#   3. Output: 3D-Position pro Cluster
#
# Performance: 2372 Cluster, 200 Iter, ca. 10-15s in numpy
# Zentral: alle Vektoroperationen, keine Python-Loops im Hot-Path.

import logging
import time
from dataclasses import dataclass

import numpy as np

log = logging.getLogger("cluster_layout")


@dataclass
class LayoutParams:
    """Tuning-Parameter fuer die Force-Sim."""
    iterations: int = 200
    repulsion_strength: float = 30.0      # Pair-Repulsion (Coulomb-artig)
    repulsion_max_dist: float = 80.0      # ueber dieser Distanz wirkt's nicht mehr
    link_distance: float = 12.0           # Ziel-Distanz fuer verbundene Cluster
    link_strength_max: float = 0.4        # Max Pull-Faktor pro Edge (nach tanh)
    boundary_radius: float = 70.0         # Soft-Boundary-Start
    boundary_strength: float = 0.05       # wie stark gegen Boundary gedrueckt wird
    initial_step: float = 1.0             # Anfangs-Schritt-Groesse
    cooldown: float = 0.985               # Schritt-Reduktion pro Iter (200 Iter -> 0.05x)
    folder_anchor_strength: float = 0.03  # Folder-Centroid-Pull (sehr leicht)


def pca_3d(centroids: np.ndarray) -> np.ndarray:
    """PCA auf 3 Dimensionen via SVD. Input (n, d), Output (n, 3)."""
    mean = centroids.mean(axis=0)
    centered = centroids - mean
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    return centered @ vt[:3].T


def compute_layout(
    centroids: np.ndarray,                # (n, d) — Concept-Embeddings-Means
    edges: list[tuple[int, int, float]],  # (idx_a, idx_b, weight)
    folder_indices: list[int | None],     # pro Cluster: Folder-Index oder None
    params: LayoutParams = LayoutParams(),
) -> np.ndarray:
    """Force-Sim auf Cluster-Ebene mit PCA-Init und Soft-Boundary.

    Args:
        centroids: (n, d) Embedding-Centroide pro Cluster
        edges: list of (i, j, weight) — Indizes in [0, n)
        folder_indices: pro Cluster der Folder-Idx oder None
        params: Tuning-Parameter

    Returns: (n, 3) Final-Positionen
    """
    n = centroids.shape[0]
    if n == 0:
        return np.zeros((0, 3))

    # Init via PCA
    log.info("PCA init ...")
    pos = pca_3d(centroids).astype(np.float64)

    # Skalieren so dass median-Distanz zum Origin ~ boundary_radius * 0.5
    norms = np.linalg.norm(pos, axis=1)
    median_norm = float(np.median(norms))
    if median_norm > 0:
        pos *= (params.boundary_radius * 0.5) / median_norm

    # Folder-Centroide initial (vor Sim)
    folder_centroids: dict[int, np.ndarray] = {}
    if any(fi is not None for fi in folder_indices):
        folder_groups: dict[int, list[int]] = {}
        for idx, fi in enumerate(folder_indices):
            if fi is None:
                continue
            folder_groups.setdefault(fi, []).append(idx)
        for fi, idxs in folder_groups.items():
            folder_centroids[fi] = pos[idxs].mean(axis=0)

    # Edge-Arrays fuer vektorisierte Updates
    if edges:
        edge_a = np.array([e[0] for e in edges], dtype=np.int32)
        edge_b = np.array([e[1] for e in edges], dtype=np.int32)
        edge_w = np.array([e[2] for e in edges], dtype=np.float64)
        # Saturieren via tanh damit Mega-Edge nicht alles zerreisst
        max_w = float(edge_w.max()) if len(edge_w) > 0 else 1.0
        edge_strength = np.tanh(edge_w / max(max_w * 0.1, 1.0)) * params.link_strength_max
    else:
        edge_a = edge_b = edge_w = edge_strength = np.array([], dtype=np.float64)

    log.info(f"Force-Sim: {n} clusters, {len(edges)} edges, {params.iterations} iter")
    start = time.time()

    step = params.initial_step
    for it in range(params.iterations):
        forces = np.zeros_like(pos)

        # === Repulsion: vektorisiertes all-pairs ===
        # Achtung Speicher: 2372 x 2372 x 3 = ~135MB fuer Diff-Tensor
        # Bei n > 4000 muesste man chunking. Fuer 2372 ok.
        diff = pos[:, None, :] - pos[None, :, :]      # (n, n, 3)
        dist_sq = np.einsum('ijk,ijk->ij', diff, diff)
        dist_sq = np.maximum(dist_sq, 1e-6)            # 0-Division verhindern
        # Cutoff
        mask = dist_sq < params.repulsion_max_dist ** 2
        # Coulomb: F = strength / r^2 * unit_dir
        inv_dist_cubed = 1.0 / (dist_sq * np.sqrt(dist_sq))
        # Diag auf 0 (sich-selbst-abstossen vermeiden)
        np.fill_diagonal(inv_dist_cubed, 0.0)
        # Mask anwenden
        inv_dist_cubed = np.where(mask, inv_dist_cubed, 0.0)
        repulsion = (diff * inv_dist_cubed[..., None]).sum(axis=1)
        forces += repulsion * params.repulsion_strength

        # === Edge-Attraktion: spring-like ===
        if len(edges) > 0:
            edge_diff = pos[edge_b] - pos[edge_a]  # (m, 3)
            edge_dist = np.linalg.norm(edge_diff, axis=1, keepdims=True)
            edge_dist = np.maximum(edge_dist, 1e-6)
            edge_unit = edge_diff / edge_dist
            # Spring: F = strength * (dist - target_dist) * unit_dir
            spring = edge_strength[:, None] * (edge_dist - params.link_distance) * edge_unit
            np.add.at(forces, edge_a, spring)
            np.add.at(forces, edge_b, -spring)

        # === Soft-Boundary: nur wenn ueber boundary_radius ===
        norms = np.linalg.norm(pos, axis=1, keepdims=True)
        excess = np.maximum(norms - params.boundary_radius, 0.0)
        if (excess > 0).any():
            unit = pos / np.maximum(norms, 1e-6)
            forces -= unit * excess * params.boundary_strength

        # === Folder-Anchor (nur bei sehr schwacher Strength) ===
        if folder_centroids and params.folder_anchor_strength > 0:
            for idx, fi in enumerate(folder_indices):
                if fi is None or fi not in folder_centroids:
                    continue
                anchor = folder_centroids[fi]
                forces[idx] += (anchor - pos[idx]) * params.folder_anchor_strength

        # Update
        pos += forces * step
        step *= params.cooldown

        if (it + 1) % 50 == 0:
            log.info(f"  iter {it+1}/{params.iterations}, step={step:.4f}")

    elapsed = time.time() - start
    log.info(f"Force-Sim done in {elapsed:.1f}s")
    return pos.astype(np.float32)
