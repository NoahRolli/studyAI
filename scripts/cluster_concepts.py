#!/usr/bin/env python3
# scripts/cluster_concepts.py
# Standalone Cluster-Generation fuer Concept-Graph (Entry-Point).
#
# Drei Modi:
#   --mode rebuild       Alle Cluster loeschen, neu gruppieren (default)
#   --mode incremental   Nur ungeclusterte Concepts neu zuordnen
#   --mode merge         Bestehende Cluster behalten, aehnliche Labels mergen
#
# Nach rebuild/incremental/merge: ruft compute_cluster_centroids.py +
# compute_sphere_layout.py auf, damit die Pipeline komplett bleibt.
#
# Usage:
#   python3 scripts/cluster_concepts.py --mode rebuild
#   python3 scripts/cluster_concepts.py --mode incremental
#   python3 scripts/cluster_concepts.py --mode merge --similarity 0.95
#   python3 scripts/cluster_concepts.py --mode rebuild --skip-pipeline

import argparse
import asyncio
import logging
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
log = logging.getLogger("cluster")

from scripts.cluster_modes import run_rebuild, run_incremental, run_merge


def run_pipeline(force_centroids: bool) -> int:
    """Ruft compute_cluster_centroids.py + compute_sphere_layout.py auf."""
    log.info("=== PIPELINE: centroids + layout ===")
    cmd1 = ["python3", str(ROOT / "scripts/compute_cluster_centroids.py")]
    if force_centroids:
        cmd1.append("--force")
    log.info(f"  {' '.join(cmd1)}")
    r1 = subprocess.run(cmd1)
    if r1.returncode != 0:
        log.error("compute_cluster_centroids failed")
        return 1
    cmd2 = ["python3", str(ROOT / "scripts/compute_sphere_layout.py")]
    log.info(f"  {' '.join(cmd2)}")
    r2 = subprocess.run(cmd2)
    if r2.returncode != 0:
        log.error("compute_sphere_layout failed")
        return 1
    log.info("=== PIPELINE DONE ===")
    return 0


async def main_async(args) -> int:
    if args.mode == "rebuild":
        await run_rebuild()
        if not args.skip_pipeline:
            return run_pipeline(force_centroids=True)
    elif args.mode == "incremental":
        await run_incremental()
        if not args.skip_pipeline:
            return run_pipeline(force_centroids=False)
    elif args.mode == "merge":
        run_merge(similarity=args.similarity)
        if not args.skip_pipeline:
            return run_pipeline(force_centroids=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Cluster generation pipeline")
    parser.add_argument(
        "--mode", choices=["rebuild", "incremental", "merge"],
        default="rebuild",
    )
    parser.add_argument(
        "--similarity", type=float, default=0.95,
        help="Merge threshold (cosine sim, default 0.95)",
    )
    parser.add_argument(
        "--skip-pipeline", action="store_true",
        help="Don't auto-run centroids+layout after",
    )
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
