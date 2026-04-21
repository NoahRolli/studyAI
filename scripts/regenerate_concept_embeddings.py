#!/usr/bin/env python3
# scripts/regenerate_concept_embeddings.py
# Standalone Embedding-Regeneration fuer Concept-Graph.
# Ersetzt den SSE-Stream, der bei >5k Konzepten gehangen hat.
# Zwei Phasen: (A) Embeddings generieren, (B) Similarity + Edges via Numpy.

import argparse
import asyncio
import json
import logging
import sys
import time
from pathlib import Path

# Projekt-Root in sys.path fuer Imports
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv()

# WICHTIG: registry zuerst, sonst SQLAlchemy-Mapper-InitError
import backend.models.registry  # noqa: F401

from backend.models.database import SessionLocal
from backend.models.concept import Concept
from backend.services.embedding_service import generate_embedding

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
# SQLAlchemy-Echo aus (war im letzten Log spammig)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
log = logging.getLogger("embed")


async def run_embeddings(batch_commit: int, force: bool) -> int:
    """Phase A: Embeddings fuer alle stale Konzepte generieren."""
    db = SessionLocal()
    try:
        query = db.query(Concept)
        if force:
            concepts = query.all()
        else:
            concepts = query.filter(
                (Concept.embedding.is_(None)) | (Concept.embedding_stale == True)
            ).all()

        total = len(concepts)
        log.info(f"Phase A: {total} Konzepte brauchen Embeddings")
        if total == 0:
            return 0

        updated = 0
        errors = 0
        start = time.time()

        for i, c in enumerate(concepts, start=1):
            text = c.name
            if c.description:
                text += f" — {c.description[:500]}"
            try:
                emb = await generate_embedding(text)
                c.embedding = json.dumps(emb)
                c.embedding_stale = False
                updated += 1
            except Exception as e:
                errors += 1
                log.warning(f"[{i}/{total}] FAIL '{c.name}': {e}")
                continue

            if i % batch_commit == 0 or i == total:
                db.commit()
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                eta_min = (total - i) / rate / 60 if rate > 0 else 0
                log.info(
                    f"[{i}/{total}] updated={updated} errors={errors} "
                    f"rate={rate:.1f}/s eta={eta_min:.1f}min"
                )

        log.info(f"Phase A done: updated={updated} errors={errors}")
        return updated
    finally:
        db.close()


def run_similarity(threshold: float, edge_batch: int) -> int:
    """Phase B: Similarity-Matrix via Numpy + Edge-Insert in Batches."""
    import numpy as np
    from backend.models.concept import ConceptEdge
    from backend.models.relation import RelationType

    db = SessionLocal()
    try:
        # 1. Alle Konzepte mit Embedding laden
        concepts = db.query(Concept).filter(Concept.embedding.isnot(None)).all()
        n = len(concepts)
        log.info(f"Phase B: {n} Konzepte mit Embedding geladen")
        if n < 2:
            log.info("Weniger als 2 Konzepte mit Embedding - skip")
            return 0

        # 2. Embeddings in Numpy-Matrix (N x D)
        vectors = []
        ids = []
        for c in concepts:
            try:
                vec = json.loads(c.embedding)
                vectors.append(vec)
                ids.append(c.id)
            except (json.JSONDecodeError, TypeError):
                continue
        M = np.array(vectors, dtype=np.float32)
        log.info(f"Matrix shape: {M.shape}, dtype={M.dtype}")

        # 3. L2-normalisieren, dann Cosine = M @ M.T
        norms = np.linalg.norm(M, axis=1, keepdims=True)
        norms[norms == 0] = 1.0  # div-by-zero vermeiden
        Mn = M / norms
        log.info("Berechne Similarity-Matrix...")
        t0 = time.time()
        sim = Mn @ Mn.T  # (N, N)
        log.info(f"Similarity-Matrix berechnet in {time.time()-t0:.2f}s")

        # 4. Oberes Dreieck + Threshold-Mask
        iu = np.triu_indices(n, k=1)
        sim_flat = sim[iu]
        mask = sim_flat >= threshold
        pair_indices = np.where(mask)[0]
        log.info(f"Paare ueber Threshold {threshold}: {len(pair_indices)}")

        if len(pair_indices) == 0:
            return 0

        # 5. Bestehende Edges laden (Dedup)
        existing = set()
        for e in db.query(ConceptEdge).all():
            existing.add((e.source_concept_id, e.target_concept_id))
            existing.add((e.target_concept_id, e.source_concept_id))
        log.info(f"Bestehende Edges: {len(existing)//2}")

        # 6. related_to RelationType
        rt = db.query(RelationType).filter(RelationType.name == "related_to").first()
        if not rt:
            log.error("RelationType 'related_to' fehlt - abort")
            return 0

        # 7. Edges in Batches inserten
        created = 0
        skipped = 0
        batch = []
        for flat_idx in pair_indices:
            i_mat = iu[0][flat_idx]
            j_mat = iu[1][flat_idx]
            id_a = ids[i_mat]
            id_b = ids[j_mat]
            if (id_a, id_b) in existing:
                skipped += 1
                continue
            s = float(sim_flat[flat_idx])
            batch.append(ConceptEdge(
                source_concept_id=id_a,
                target_concept_id=id_b,
                relation_type_id=rt.id,
                strength=round(s, 3),
                origin="embedding_similarity",
                status="suggested",
                reason=f"Embedding similarity: {s:.2f}",
            ))
            if len(batch) >= edge_batch:
                db.bulk_save_objects(batch)
                db.commit()
                created += len(batch)
                log.info(f"Inserted {created} edges (skipped existing: {skipped})")
                batch = []
        if batch:
            db.bulk_save_objects(batch)
            db.commit()
            created += len(batch)

        log.info(f"Phase B done: created={created} skipped={skipped}")
        return created
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Embedding-Regeneration fuer Konzepte")
    parser.add_argument("--mode", choices=["embeddings", "similarity", "all"],
                        default="all", help="Welche Phase(n) ausfuehren")
    parser.add_argument("--threshold", type=float, default=0.85,
                        help="Similarity-Cutoff fuer Edges (default 0.85)")
    parser.add_argument("--batch-commit", type=int, default=20,
                        help="Commit-Interval in Phase A")
    parser.add_argument("--edge-batch", type=int, default=500,
                        help="Insert-Batch-Size in Phase B")
    parser.add_argument("--force", action="store_true",
                        help="Auch bereits embeddete Konzepte neu generieren")
    args = parser.parse_args()

    log.info(f"Start mode={args.mode} threshold={args.threshold}")

    if args.mode in ("embeddings", "all"):
        asyncio.run(run_embeddings(args.batch_commit, args.force))

    if args.mode in ("similarity", "all"):
        run_similarity(args.threshold, args.edge_batch)


if __name__ == "__main__":
    main()
