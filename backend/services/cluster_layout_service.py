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
    repulsion_strength: float = 80.0      # Pair-Repulsion (Coulomb-artig)
    repulsion_max_dist: float = 120.0     # ueber dieser Distanz wirkt's nicht mehr
    link_distance: float = 25.0           # Ziel-Distanz fuer verbundene Cluster
    link_strength_max: float = 0.15       # Max Pull-Faktor pro Edge (nach tanh)
    boundary_radius: float = 100.0        # Soft-Boundary-Start
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

        # === Repulsion: chunked all-pairs mit numerischem Schutz ===
        # Distance-Floor verhindert Explosion bei nahen Paaren
        # Force-Cap verhindert dass ein Cluster ins Nirgendwo fliegt
        DIST_FLOOR_SQ = 4.0     # Mindestabstand 2.0 in Sim-Einheiten
        FORCE_CAP = 5.0         # Max Force-Magnitude pro Cluster pro Iter
        max_dist_sq = params.repulsion_max_dist ** 2

        # Chunked, damit der (n, n, 3) Tensor nicht den RAM auffrisst
        # und CPU-Cache effizienter wird
        chunk_size = 256
        repulsion = np.zeros_like(pos)
        for i in range(0, n, chunk_size):
            j = min(i + chunk_size, n)
            diff = pos[i:j, None, :] - pos[None, :, :]            # (chunk, n, 3)
            dist_sq = np.einsum('ijk,ijk->ij', diff, diff)
            dist_sq = np.maximum(dist_sq, DIST_FLOOR_SQ)           # WICHTIG
            # Eigene Diagonale ausnullen
            for k in range(i, j):
                dist_sq[k - i, k] = np.inf
            # Cutoff
            within = dist_sq < max_dist_sq
            inv_r3 = np.where(within, dist_sq ** (-1.5), 0.0)
            # Force-Vektor pro Pair
            chunk_force = (diff * inv_r3[..., None]).sum(axis=1)
            repulsion[i:j] = chunk_force

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

        # === Force-Cap NACH allen Force-Komponenten ===
        # (Repulsion + Edge-Spring + Boundary + Folder-Anchor)
        # Schutz gegen div-by-zero fuer Cluster mit force=0
        force_norms = np.linalg.norm(forces, axis=1, keepdims=True)
        safe_norms = np.maximum(force_norms, 1e-12)
        scale = np.where(force_norms > FORCE_CAP, FORCE_CAP / safe_norms, 1.0)
        forces = forces * scale

        # Update
        pos += forces * step
        step *= params.cooldown

        if (it + 1) % 50 == 0:
            log.info(f"  iter {it+1}/{params.iterations}, step={step:.4f}")

    elapsed = time.time() - start
    log.info(f"Force-Sim done in {elapsed:.1f}s")

    # Sanity: NaN/Inf -> auf Sphere-Rand projizieren
    bad = ~np.isfinite(pos).all(axis=1)
    if bad.any():
        log.warning(f"  {int(bad.sum())} cluster mit NaN/Inf — auf Boundary projiziert")
        # Random Punkte auf der Boundary
        rng = np.random.default_rng(seed=42)
        for idx in np.where(bad)[0]:
            v = rng.normal(size=3)
            v = v / np.linalg.norm(v) * params.boundary_radius
            pos[idx] = v

    # Hard-Clip falls noch krasse Outlier dabei sind
    norms = np.linalg.norm(pos, axis=1, keepdims=True)
    too_far = norms > params.boundary_radius * 1.5
    if too_far.any():
        log.warning(f"  {int(too_far.sum())} cluster ueber 1.5x boundary — clamped")
        scale = np.where(too_far, params.boundary_radius * 1.2 / np.maximum(norms, 1e-6), 1.0)
        pos = pos * scale

    return pos.astype(np.float32)
