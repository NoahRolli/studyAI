# Sphere-Layout API — Cluster-Positionen via PCA auf Centroid-Embeddings
# Endpoint: GET /api/concepts/sphere-layout
#
# Strategie:
#   1. Lade alle Cluster-Centroide (1024-dim) aus DB
#   2. PCA via SVD auf 3D
#   3. Skalierung auf Sphere-Radius
#   4. Output: {cluster_id: [x,y,z]} + Folder-Info fuer Hybrid-Mode
#
# Performance: 2372 Centroide × 1024 dim, SVD <500ms

import json

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.concept import (
    ConceptCluster, ConceptClusterMember, ConceptSource, ConceptEdge,
)
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module
from backend.models.llm import LLMMessage, LLMConversation

router = APIRouter(prefix="/api/concepts", tags=["concepts-sphere"])


def _build_concept_folder_map(db: Session) -> dict[int, int]:
    """Concept-ID -> Folder-ID. Ohne Folder-Names (die holen wir separat)."""
    sum_folder: dict[int, int] = {}
    rows = db.query(
        Summary.id, Document.folder_id, Module.folder_id,
    ).join(Document, Summary.document_id == Document.id
    ).outerjoin(Module, Document.module_id == Module.id).all()
    for sum_id, doc_fid, mod_fid in rows:
        fid = doc_fid or mod_fid
        if fid:
            sum_folder[sum_id] = fid

    msg_folder: dict[int, int] = {}
    msg_rows = db.query(
        LLMMessage.id, Document.folder_id, Module.folder_id,
    ).join(LLMConversation, LLMMessage.conversation_id == LLMConversation.id
    ).join(Document, LLMConversation.document_id == Document.id
    ).outerjoin(Module, Document.module_id == Module.id).all()
    for msg_id, doc_fid, mod_fid in msg_rows:
        fid = doc_fid or mod_fid
        if fid:
            msg_folder[msg_id] = fid

    result: dict[int, int] = {}
    for s in db.query(ConceptSource).filter(
        ConceptSource.source_type == "summary",
    ).all():
        if s.concept_id not in result and s.source_id in sum_folder:
            result[s.concept_id] = sum_folder[s.source_id]
    for s in db.query(ConceptSource).filter(
        ConceptSource.source_type == "chat_message",
    ).all():
        if s.concept_id not in result and s.source_id in msg_folder:
            result[s.concept_id] = msg_folder[s.source_id]
    return result


def _pca_3d(matrix: np.ndarray) -> np.ndarray:
    """PCA auf 3 Dimensionen via SVD.
    Input:  (n, d)  zentrierte oder rohe Vektoren
    Output: (n, 3)  Projektion auf die drei staerksten Hauptachsen.
    """
    # Zentrieren
    mean = matrix.mean(axis=0)
    centered = matrix - mean
    # Truncated SVD via numpy (full ist bei n=2372,d=1024 noch ok ~200ms)
    # full_matrices=False fuer Speicher
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    # Erste drei Hauptachsen → Projektion
    components = vt[:3]  # (3, d)
    projected = centered @ components.T  # (n, 3)
    return projected


def _scale_to_shell(coords: np.ndarray, target_radius: float) -> np.ndarray:
    """Quantil-basierte Skalierung: 90% der Punkte landen in [0.4, 0.95] * shell.
    Verhindert dass ein Outlier-Cluster den Rand definiert und der Rest in
    einer dichten Wolke kollabiert. Power-Law-PCA-Verteilungen werden so
    aufgespreizt zu einer echten Shell.
    """
    norms = np.linalg.norm(coords, axis=1)
    if norms.size == 0:
        return coords
    # Quantile der aktuellen Verteilung
    q05, q95 = np.quantile(norms, [0.05, 0.95])
    if q95 <= q05:
        # Degenerierte Verteilung — fallback auf Max-Skalierung
        max_norm = float(norms.max()) if norms.max() > 0 else 1.0
        return coords * (target_radius / max_norm)
    # Map [q05, q95] -> [shell*0.4, shell*0.95] linear, dann clamp auf [shell*0.3, shell]
    target_low = target_radius * 0.4
    target_high = target_radius * 0.95
    new_norms = target_low + (norms - q05) * (target_high - target_low) / (q95 - q05)
    new_norms = np.clip(new_norms, target_radius * 0.3, target_radius)
    # Skalierungsfaktor pro Punkt
    factors = np.where(norms > 0, new_norms / norms, 1.0)
    return coords * factors[:, None]


def _compute_cluster_edges(
    db: Session,
    cluster_member_ids: dict[int, list[int]],
    min_strength: float = 0.85,
) -> tuple[list[tuple[int, int, float]], dict[int, float]]:
    """Aggregiert Concept-Edges auf Cluster-Ebene.

    Returns:
        cluster_edges: List of (cluster_a, cluster_b, weight) — sortiert, undirected
        connectivity: cluster_id -> total weight (sum over all its edges)
    """
    # Concept -> Cluster Lookup (1:N moeglich, wir nehmen erstes Cluster pro Concept)
    concept_to_cluster: dict[int, int] = {}
    for cl_id, members in cluster_member_ids.items():
        for cid in members:
            if cid not in concept_to_cluster:
                concept_to_cluster[cid] = cl_id

    # Aggregate
    pair_weights: dict[tuple[int, int], float] = {}
    edges = db.query(
        ConceptEdge.source_concept_id,
        ConceptEdge.target_concept_id,
        ConceptEdge.strength,
        ConceptEdge.status,
    ).filter(
        ConceptEdge.status != "rejected",
        ConceptEdge.strength >= min_strength,
    ).all()

    for src, tgt, strength, _status in edges:
        cl_a = concept_to_cluster.get(src)
        cl_b = concept_to_cluster.get(tgt)
        if cl_a is None or cl_b is None or cl_a == cl_b:
            continue
        # Undirected: kanonisch sortieren
        key = (cl_a, cl_b) if cl_a < cl_b else (cl_b, cl_a)
        pair_weights[key] = pair_weights.get(key, 0.0) + float(strength or 0.0)

    cluster_edges = [(a, b, w) for (a, b), w in pair_weights.items()]
    # Connectivity = Summe aller Edge-Gewichte pro Cluster
    connectivity: dict[int, float] = {}
    for a, b, w in cluster_edges:
        connectivity[a] = connectivity.get(a, 0.0) + w
        connectivity[b] = connectivity.get(b, 0.0) + w

    return cluster_edges, connectivity


@router.get("/sphere-layout")
def get_sphere_layout(db: Session = Depends(get_db)):
    """Liefert pre-computed Cluster-Positionen (Force-Sim cached in DB).

    Voraussetzung: scripts/compute_sphere_layout.py wurde ausgefuehrt
    und hat final_x/y/z in concept_clusters geschrieben.

    Response shape:
      {
        "cluster_positions": { "<cluster_id>": [x, y, z], ... },
        "cluster_folders":   { "<cluster_id>": <folder_id|null>, ... },
        "shell_radius": float,
        "cluster_connectivity": { "<cluster_id>": float, ... }
      }
    """
    clusters = db.query(ConceptCluster).filter(
        ConceptCluster.final_x.isnot(None),
        ConceptCluster.final_y.isnot(None),
        ConceptCluster.final_z.isnot(None),
    ).all()
    if not clusters:
        raise HTTPException(
            status_code=404,
            detail=("No pre-computed sphere layout. "
                    "Run scripts/compute_sphere_layout.py first."),
        )

    # Cluster-Member-Map fuer Folder + Connectivity-Aggregation
    cluster_member_ids: dict[int, list[int]] = {}
    for cl in clusters:
        members = db.query(ConceptClusterMember.concept_id).filter(
            ConceptClusterMember.cluster_id == cl.id,
        ).all()
        cluster_member_ids[cl.id] = [m[0] for m in members]

    # Dominanten Folder pro Cluster
    concept_folder = _build_concept_folder_map(db)
    cluster_folders: dict[str, int | None] = {}
    for cl in clusters:
        counts: dict[int, int] = {}
        for cid in cluster_member_ids[cl.id]:
            fid_pair = concept_folder.get(cid)
            if fid_pair is None:
                continue
            fid = fid_pair[0] if isinstance(fid_pair, tuple) else fid_pair
            counts[fid] = counts.get(fid, 0) + 1
        best_fid: int | None = None
        best_cnt = 0
        for fid, cnt in counts.items():
            if cnt > best_cnt:
                best_fid = fid
                best_cnt = cnt
        cluster_folders[str(cl.id)] = best_fid

    # Positions direkt aus DB
    cluster_positions: dict[str, list[float]] = {}
    for cl in clusters:
        cluster_positions[str(cl.id)] = [
            float(cl.final_x), float(cl.final_y), float(cl.final_z),
        ]

    # Connectivity nur — Edges selbst werden im Frontend nicht mehr fuer Sim gebraucht
    _, connectivity = _compute_cluster_edges(
        db, cluster_member_ids, min_strength=0.85,
    )

    # Shell-Radius aus Daten ableiten (95-Perzentil der Norms)
    norms = np.array([
        np.sqrt(cl.final_x ** 2 + cl.final_y ** 2 + cl.final_z ** 2)
        for cl in clusters
    ])
    shell_radius = float(np.quantile(norms, 0.95)) if len(norms) > 0 else 70.0

    return {
        "cluster_positions": cluster_positions,
        "cluster_folders": cluster_folders,
        "shell_radius": shell_radius,
        "cluster_connectivity": {
            str(cid): w for cid, w in connectivity.items()
        },
    }
