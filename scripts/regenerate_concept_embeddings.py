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
        log.info("Phase B: noch nicht implementiert (Commit 2)")


if __name__ == "__main__":
    main()
