#!/usr/bin/env python3
# scripts/compute_sphere_layout.py
# Pre-computed Cluster-Layout: PCA + Force-Sim auf Cluster-Ebene.
# Schreibt final_x/y/z in concept_clusters.
#
# Usage:
#   python3 scripts/compute_sphere_layout.py
#   python3 scripts/compute_sphere_layout.py --iterations 300
#
# Voraussetzung: centroid_text muss gesetzt sein (run compute_cluster_centroids.py first)

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv()

import backend.models.registry  # noqa: F401

from backend.models.database import SessionLocal
from backend.models.concept import (
    ConceptCluster, ConceptClusterMember,
)
from backend.api.concepts_graph import _build_concept_folder_map
from backend.api.concepts_sphere_layout import _compute_cluster_edges
from backend.services.cluster_layout_service import (
    compute_layout, LayoutParams,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
log = logging.getLogger("layout")


def run(iterations: int, edge_min_strength: float) -> int:
    db = SessionLocal()
    try:
        # 1. Cluster mit Centroiden laden
        clusters = db.query(ConceptCluster).filter(
            ConceptCluster.centroid_text.isnot(None),
        ).order_by(ConceptCluster.id).all()
        n = len(clusters)
        log.info(f"{n} cluster mit centroid_text")
        if n == 0:
            log.error("Keine Centroide vorhanden — run compute_cluster_centroids.py first")
            return 1

        # 2. Centroide stacken
        log.info("Centroide parsen ...")
        centroid_list = []
        valid: list[ConceptCluster] = []
        for cl in clusters:
            try:
                arr = json.loads(cl.centroid_text)
                if isinstance(arr, list) and len(arr) > 0:
                    centroid_list.append(np.asarray(arr, dtype=np.float32))
                    valid.append(cl)
            except Exception:
                continue
        centroids = np.stack(centroid_list, axis=0)
        log.info(f"  {centroids.shape[0]} valide Centroide, dim={centroids.shape[1]}")

        # 3. Folder-Mapping (Cluster-ID -> Folder-ID -> Folder-Index)
        log.info("Folder-Mapping ...")
        cluster_idx = {cl.id: i for i, cl in enumerate(valid)}
        cluster_member_ids: dict[int, list[int]] = {}
        for cl in valid:
            members = db.query(ConceptClusterMember.concept_id).filter(
                ConceptClusterMember.cluster_id == cl.id,
            ).all()
            cluster_member_ids[cl.id] = [m[0] for m in members]

        concept_folder = _build_concept_folder_map(db)
        # Dominanter Folder pro Cluster
        cluster_folder_id: dict[int, int | None] = {}
        for cl in valid:
            counts: dict[int, int] = {}
            for cid in cluster_member_ids[cl.id]:
                fid_pair = concept_folder.get(cid)
                if fid_pair is None:
                    continue
                # _build_concept_folder_map liefert (folder_id, folder_name)
                fid = fid_pair[0] if isinstance(fid_pair, tuple) else fid_pair
                counts[fid] = counts.get(fid, 0) + 1
            best: int | None = None
            best_n = 0
            for fid, c in counts.items():
                if c > best_n:
                    best = fid
                    best_n = c
            cluster_folder_id[cl.id] = best

        # Folder-Index-Liste fuer Force-Sim (None falls kein Folder)
        all_fids = sorted({fid for fid in cluster_folder_id.values() if fid is not None})
        fid_to_index = {fid: i for i, fid in enumerate(all_fids)}
        folder_indices: list[int | None] = []
        for cl in valid:
            fid = cluster_folder_id.get(cl.id)
            folder_indices.append(fid_to_index[fid] if fid is not None else None)

        # 4. Cluster-Edges aggregieren
        log.info("Cluster-Edges aggregieren ...")
        cluster_edges_raw, _connectivity = _compute_cluster_edges(
            db, cluster_member_ids, min_strength=edge_min_strength,
        )
        # In Indizes uebersetzen
        edge_tuples: list[tuple[int, int, float]] = []
        for a, b, w in cluster_edges_raw:
            ia = cluster_idx.get(a)
            ib = cluster_idx.get(b)
            if ia is None or ib is None:
                continue
            edge_tuples.append((ia, ib, w))
        log.info(f"  {len(edge_tuples)} Cluster-Edges im Sim")

        # 5. Force-Sim
        params = LayoutParams(iterations=iterations)
        positions = compute_layout(
            centroids=centroids,
            edges=edge_tuples,
            folder_indices=folder_indices,
            params=params,
        )

        # 6. Speichern
        log.info("Schreibe final_x/y/z ...")
        start = time.time()
        for cl, pos in zip(valid, positions):
            cl.final_x = float(pos[0])
            cl.final_y = float(pos[1])
            cl.final_z = float(pos[2])
        db.commit()
        log.info(f"  saved in {time.time() - start:.2f}s")
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Pre-compute cluster sphere layout")
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--edge-min-strength", type=float, default=0.85)
    args = parser.parse_args()
    return run(args.iterations, args.edge_min_strength)


if __name__ == "__main__":
    sys.exit(main())
