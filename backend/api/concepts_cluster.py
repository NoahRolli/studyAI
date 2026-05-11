# Konzept-Cluster Helpers — Ordner-Seed Batching fuer Auto-Cluster-Stream
#
# Dieses Modul stellt Helper-Funktionen fuer concepts_cluster_stream.py
# bereit. Der frueher hier vorhandene synchrone POST /auto-cluster Endpoint
# wurde in Chat 66 entfernt — der Stream-Endpoint hat ihn vollstaendig
# abgeloest (Cancel-Support, disable_groq, Forward-Progress, Live-Progress
# via SSE, Connector-Cooldown).
#
# Helpers:
# - _build_concept_folder_map: Konzept → primaerer Ordner. Zweistufig:
#     (1) Plurality-Voting ueber Summary-Sources (via Module-Fallback)
#     (2) Embedding-Inferenz fuer Concepts ohne Summary-Source via
#         Cosine-Sim zu Folder-Centroiden (Threshold 0.5)
# - _build_folder_batches: Konzepte nach Ordner gruppieren, 40er-Batches

import json
import logging
from collections import Counter, defaultdict

import numpy as np
from fastapi import APIRouter
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.models.concept import Concept, ConceptSource
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module
from backend.models.folder import Folder

logger = logging.getLogger(__name__)

# Min Concepts pro Folder fuer stabilen Centroid (sonst ueberspringen)
INFERENCE_MIN_CONCEPTS_PER_FOLDER = 3
# Cosine-Sim Threshold fuer Embedding-Inferenz (Chat 72 Diagnose: 99.6% > 0.5)
INFERENCE_SIM_THRESHOLD = 0.5

router = APIRouter(prefix="/api/concepts", tags=["concepts-cluster"])


def _parse_embedding(raw) -> np.ndarray | None:
    """Concept.embedding ist JSON-String mit 1024-dim Vektor (bge-m3)."""
    if raw is None:
        return None
    try:
        vec = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return None
    arr = np.array(vec, dtype=np.float32)
    return arr if arr.size > 0 else None


def _build_summary_folder_map(db: Session) -> dict[int, int]:
    """Plurality-Voting: Konzept → Folder via Summary-Sources.

    Pfad: ConceptSource(summary) → Summary → Document → Folder.
    Fallback: wenn Document keinen folder_id hat, nimm Module.folder_id.
    Bei Concepts mit mehreren Folder-Sources: Folder mit meisten Votes
    gewinnt, bei Gleichstand kleinste Folder-ID (deterministisch).
    """
    sql = """
        SELECT cs.concept_id,
               COALESCE(d.folder_id, m.folder_id) AS resolved_folder
        FROM concept_sources cs
        JOIN summaries s ON s.id = cs.source_id
        JOIN documents d ON d.id = s.document_id
        LEFT JOIN modules m ON m.id = d.module_id
        WHERE cs.source_type = 'summary'
          AND COALESCE(d.folder_id, m.folder_id) IS NOT NULL
    """
    rows = db.execute(text(sql)).fetchall()

    votes: dict[int, Counter] = defaultdict(Counter)
    for cid, fid in rows:
        votes[cid][fid] += 1

    mapped: dict[int, int] = {}
    for cid, c in votes.items():
        max_count = max(c.values())
        winners = sorted(fid for fid, n in c.items() if n == max_count)
        mapped[cid] = winners[0]
    return mapped


def _infer_folders_via_embedding(
    db: Session,
    summary_mapped: dict[int, int],
) -> dict[int, int]:
    """Embedding-Inferenz: ergaenzt summary_mapped um Top-1-Folder fuer
    Concepts ohne Summary-Source.

    Schritte:
    (1) Folder-Centroide bauen aus normalisierten Embeddings der bereits
        summary-gemappten Concepts (mind. 3 Concepts pro Folder).
    (2) Fuer jedes nicht-gemappte Concept mit Embedding: Cosine-Sim zu
        allen Centroiden, Top-1 falls sim >= Threshold (0.5).

    Returns: erweitertes Mapping (summary + inferred).
    """
    # === Centroide bauen ===
    folder_embs: dict[int, list[np.ndarray]] = defaultdict(list)
    mapped_cids = list(summary_mapped.keys())

    BATCH = 500
    for i in range(0, len(mapped_cids), BATCH):
        sub = mapped_cids[i:i + BATCH]
        for cid, emb in db.query(Concept.id, Concept.embedding).filter(
            Concept.id.in_(sub)
        ).all():
            vec = _parse_embedding(emb)
            if vec is None:
                continue
            folder_embs[summary_mapped[cid]].append(vec)

    folder_centroids: dict[int, np.ndarray] = {}
    for fid, vecs in folder_embs.items():
        if len(vecs) < INFERENCE_MIN_CONCEPTS_PER_FOLDER:
            continue
        centroid = np.mean(np.stack(vecs), axis=0)
        norm = float(np.linalg.norm(centroid))
        if norm < 1e-6:
            continue
        folder_centroids[fid] = centroid / norm

    if not folder_centroids:
        logger.warning("Keine Folder-Centroide gebaut - Inferenz skipped")
        return dict(summary_mapped)

    centroid_ids = sorted(folder_centroids.keys())
    centroid_matrix = np.stack([folder_centroids[fid] for fid in centroid_ids])

    # === Inferenz ===
    all_cids = [c for c, in db.query(Concept.id).filter(
        Concept.embedding.isnot(None)
    ).all()]
    no_folder_cids = [c for c in all_cids if c not in summary_mapped]

    result = dict(summary_mapped)  # Copy, nicht in-place
    n_inferred = 0
    n_below_threshold = 0

    for i in range(0, len(no_folder_cids), BATCH):
        sub = no_folder_cids[i:i + BATCH]
        for cid, emb in db.query(Concept.id, Concept.embedding).filter(
            Concept.id.in_(sub)
        ).all():
            vec = _parse_embedding(emb)
            if vec is None:
                continue
            norm = float(np.linalg.norm(vec))
            if norm < 1e-6:
                continue
            sims = centroid_matrix @ (vec / norm)
            top_idx = int(np.argmax(sims))
            top_sim = float(sims[top_idx])
            if top_sim >= INFERENCE_SIM_THRESHOLD:
                result[cid] = centroid_ids[top_idx]
                n_inferred += 1
            else:
                n_below_threshold += 1

    logger.info(
        f"Folder-Inferenz: {len(summary_mapped)} summary-mapped, "
        f"{n_inferred} embedding-inferred (sim>={INFERENCE_SIM_THRESHOLD}), "
        f"{n_below_threshold} below threshold (bleiben no_folder)"
    )
    return result


def _build_concept_folder_map(db: Session) -> dict[int, int | None]:
    """Ordnet jedem Konzept seinen primaeren Ordner zu.

    Zwei-Phasen-Pipeline (Chat 72):
    (1) Summary-Source Plurality-Voting (~968 Concepts mit direkter
        Folder-Evidenz).
    (2) Embedding-Inferenz fuer den Rest (~14000 Concepts) via Cosine-Sim
        zu Folder-Centroiden, Threshold 0.5.

    Concepts unter dem Sim-Threshold bleiben im no_folder-Batch.
    """
    summary_mapped = _build_summary_folder_map(db)
    full_mapped = _infer_folders_via_embedding(db, summary_mapped)
    return full_mapped


def _build_folder_batches(
    concepts: list[Concept],
    concept_folder: dict[int, int | None],
    db: Session,
) -> list[tuple[str, list[str]]]:
    """Gruppiert Konzepte nach Ordner fuer Seed-Batching.
    Gibt Liste von (folder_hint, [concept_names]) zurueck."""
    folder_groups: dict[int, list[str]] = defaultdict(list)
    no_folder: list[str] = []

    for c in concepts:
        fid = concept_folder.get(c.id)
        if fid:
            folder_groups[fid].append(c.name)
        else:
            no_folder.append(c.name)

    # Ordner-Labels holen
    folder_labels: dict[int, str] = {}
    if folder_groups:
        folders = db.query(Folder).filter(
            Folder.id.in_(folder_groups.keys())
        ).all()
        folder_labels = {f.id: f.name for f in folders}

    batches: list[tuple[str, list[str]]] = []
    for fid, names in folder_groups.items():
        label = folder_labels.get(fid, "")
        # Grosse Ordner in 40er-Batches splitten
        for i in range(0, len(names), 40):
            batches.append((label, names[i:i + 40]))

    # Ordnerlose Konzepte in 40er-Batches
    for i in range(0, len(no_folder), 40):
        batches.append(("", no_folder[i:i + 40]))

    return batches
