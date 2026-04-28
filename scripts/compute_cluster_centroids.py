#!/usr/bin/env python3
# scripts/compute_cluster_centroids.py
# Berechnet Cluster-Centroide aus Concept-Embeddings.
# Speichert centroid_text (JSON-Array) + centroid_dim in concept_clusters.
#
# Usage:
#   python3 scripts/compute_cluster_centroids.py
#   python3 scripts/compute_cluster_centroids.py --force
#
# Strategy:
#   1. Lade alle Cluster mit Members
#   2. Pro Cluster: Mean ueber Member-Embeddings (numpy)
#   3. Speichere als JSON-String + dim

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
    Concept, ConceptCluster, ConceptClusterMember,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
log = logging.getLogger("centroids")


def parse_embedding(text: str | None) -> np.ndarray | None:
    """Concept.embedding ist JSON-Text. Parsen und in float32 wandeln."""
    if not text:
        return None
    try:
        arr = json.loads(text)
        if not isinstance(arr, list) or len(arr) == 0:
            return None
        return np.asarray(arr, dtype=np.float32)
    except Exception:
        return None


def compute_centroids(force: bool) -> tuple[int, int, int]:
    """Liefert (verarbeitete, geskipte, Fehler)."""
    db = SessionLocal()
    try:
        clusters = db.query(ConceptCluster).all()
        total = len(clusters)
        log.info(f"{total} Cluster gefunden")

        if total == 0:
            return 0, 0, 0

        # Cache aller Concept-Embeddings als Dict {concept_id: np.array}
        # Einmaliges Parsen statt pro Cluster — bei 12k Concepts spart das viel
        log.info("Lade Concept-Embeddings ...")
        all_concepts = db.query(
            Concept.id, Concept.embedding,
        ).filter(Concept.embedding.isnot(None)).all()
        emb_cache: dict[int, np.ndarray] = {}
        for cid, etext in all_concepts:
            arr = parse_embedding(etext)
            if arr is not None:
                emb_cache[cid] = arr
        log.info(f"  {len(emb_cache)} valide Embeddings im Cache")

        if not emb_cache:
            log.error("Keine Embeddings vorhanden — abbrechen")
            return 0, total, 1

        # Erwartete Dimension aus erstem Embedding
        expected_dim = next(iter(emb_cache.values())).shape[0]
        log.info(f"  Embedding-Dimension: {expected_dim}")

        processed = 0
        skipped = 0
        errors = 0
        start = time.time()

        for i, cluster in enumerate(clusters, start=1):
            if not force and cluster.centroid_text is not None:
                skipped += 1
                continue

            # Member-IDs holen
            members = db.query(ConceptClusterMember.concept_id).filter(
                ConceptClusterMember.cluster_id == cluster.id,
            ).all()
            member_ids = [m[0] for m in members]

            # Embeddings sammeln
            vectors = [emb_cache[cid] for cid in member_ids if cid in emb_cache]

            if len(vectors) == 0:
                log.warning(f"Cluster {cluster.id} '{cluster.label}': keine Member-Embeddings")
                errors += 1
                continue

            # Centroid = Mean
            try:
                stacked = np.stack(vectors, axis=0)
                centroid = stacked.mean(axis=0)
                # Normalisieren — sonst skaliert PCA spaeter komisch
                norm = np.linalg.norm(centroid)
                if norm > 0:
                    centroid = centroid / norm
                centroid_list = centroid.astype(np.float32).tolist()
                cluster.centroid_text = json.dumps(centroid_list)
                cluster.centroid_dim = expected_dim
                processed += 1
            except Exception as e:
                log.error(f"Cluster {cluster.id}: {e}")
                errors += 1
                continue

            # Periodisches Commit
            if i % 100 == 0:
                db.commit()
                rate = i / (time.time() - start)
                log.info(f"  {i}/{total} ({rate:.1f}/s) — proc={processed} skip={skipped} err={errors}")

        db.commit()
        elapsed = time.time() - start
        log.info(f"Fertig: {processed} processed, {skipped} skipped, {errors} errors in {elapsed:.1f}s")
        return processed, skipped, errors
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute cluster centroids from concept embeddings")
    parser.add_argument(
        "--force", action="store_true",
        help="Recompute auch fuer Cluster die bereits einen Centroid haben",
    )
    args = parser.parse_args()
    proc, skip, err = compute_centroids(force=args.force)
    return 0 if err == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
