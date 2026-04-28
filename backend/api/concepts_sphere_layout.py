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
    ConceptCluster, ConceptClusterMember, ConceptSource,
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


@router.get("/sphere-layout")
def get_sphere_layout(db: Session = Depends(get_db)):
    """Liefert pre-computed Cluster-Positionen (PCA auf Centroide).

    Response shape:
      {
        "cluster_positions": { "<cluster_id>": [x, y, z], ... },
        "cluster_folders":   { "<cluster_id>": <folder_id|null>, ... },
        "shell_radius": float
      }
    """
    clusters = db.query(ConceptCluster).filter(
        ConceptCluster.centroid_text.isnot(None),
    ).all()
    if not clusters:
        raise HTTPException(
            status_code=404,
            detail="No cluster centroids — run scripts/compute_cluster_centroids.py",
        )

    # Centroide parsen
    valid_clusters: list[ConceptCluster] = []
    centroid_list: list[np.ndarray] = []
    for cl in clusters:
        try:
            arr = json.loads(cl.centroid_text)
            if isinstance(arr, list) and len(arr) > 0:
                centroid_list.append(np.asarray(arr, dtype=np.float32))
                valid_clusters.append(cl)
        except Exception:
            continue

    if not valid_clusters:
        raise HTTPException(status_code=500, detail="Centroide invalid")

    matrix = np.stack(centroid_list, axis=0)  # (n, 1024)

    # PCA → 3D
    coords3d = _pca_3d(matrix)  # (n, 3)

    # Auf sinnvollen Sphere-Radius skalieren
    # n=2372 → radius ~ 8 + sqrt(2372)*1.2 ~ 66
    n = len(valid_clusters)
    target_radius = 8.0 + np.sqrt(n) * 1.2
    scaled = _scale_to_shell(coords3d, target_radius)

    # Dominanten Folder pro Cluster bestimmen (fuer Hybrid-Mode)
    concept_folder = _build_concept_folder_map(db)
    cluster_positions: dict[str, list[float]] = {}
    cluster_folders: dict[str, int | None] = {}

    for cl, pos in zip(valid_clusters, scaled):
        members = db.query(ConceptClusterMember.concept_id).filter(
            ConceptClusterMember.cluster_id == cl.id,
        ).all()
        member_ids = [m[0] for m in members]
        # Dominanter Folder
        folder_counts: dict[int, int] = {}
        for cid in member_ids:
            fid = concept_folder.get(cid)
            if fid:
                folder_counts[fid] = folder_counts.get(fid, 0) + 1
        best_fid: int | None = None
        best_cnt = 0
        for fid, cnt in folder_counts.items():
            if cnt > best_cnt:
                best_fid = fid
                best_cnt = cnt
        cluster_positions[str(cl.id)] = [float(pos[0]), float(pos[1]), float(pos[2])]
        cluster_folders[str(cl.id)] = best_fid

    return {
        "cluster_positions": cluster_positions,
        "cluster_folders": cluster_folders,
        "shell_radius": float(target_radius),
    }
