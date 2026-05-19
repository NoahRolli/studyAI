#!/usr/bin/env python3
"""Phase B v2 CLI: Misc-Cluster aufbrechen mit Prompt v2.

v2-Aenderungen:
- --sample N: nur N zufaellige Concepts pro Misc-Cluster (Test-Mode)
- Forbidden-Filter + Merge statt Residual-Bucket
- MIN_SUB_CLUSTER_SIZE=3

Usage:
    # Sub-Sample-Test (200 Concepts pro Cluster, schreibt nichts):
    python3 -m scripts.run_subcluster_misc --sample 200

    # Full-Run Preview:
    python3 -m scripts.run_subcluster_misc

    # Full-Run + commit + layout:
    python3 -m scripts.run_subcluster_misc --commit --yes
"""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.models import registry  # noqa: F401, E402
from backend.models.database import SessionLocal  # noqa: E402
from backend.models.concept import (  # noqa: E402
    Concept, ConceptCluster,
)
from backend.api.concepts_subcluster_misc import (  # noqa: E402
    build_plan, commit_plan,
)

# Layout-Scripts wie in concepts_cluster_stream.py
_SCRIPTS_DIR = _ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
from compute_cluster_centroids import compute_centroids as _compute_centroids  # noqa: E402
from compute_sphere_layout import run as _run_sphere_layout  # noqa: E402


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("phase-b-v2")


def run_layout() -> int:
    log.info("Compute centroids ...")
    _compute_centroids(True)
    log.info("Run sphere layout (200 iter, step=0.85) ...")
    rc = _run_sphere_layout(200, 0.85)
    log.info(f"Layout done, rc={rc}")
    return rc


def print_preview(plan: dict, db) -> None:
    """Tabellarische Vorschau."""
    print()
    print("=" * 72)
    title = "PHASE B v2 — Subcluster Preview"
    if plan.get("sample_mode"):
        title += " (SAMPLE MODE)"
    print(title)
    print("=" * 72)

    total_sub = 0
    total_members = 0
    for old_id, sub_plan in plan["themed"].items():
        old_cluster = db.query(ConceptCluster).filter_by(id=old_id).first()
        old_label = old_cluster.label if old_cluster else f"<gone:{old_id}>"
        old_count = sum(len(m) for m in sub_plan.values())
        total_sub += len(sub_plan)
        total_members += old_count

        print()
        print(f"  [{old_id}] {old_label} ({old_count} members)")
        print(f"      -> {len(sub_plan)} new sub-clusters:")
        sorted_subs = sorted(
            sub_plan.items(), key=lambda x: -len(x[1])
        )
        for label, members in sorted_subs[:12]:
            print(f"        {label:50s} {len(members):>4} members")
        if len(sorted_subs) > 12:
            other = sum(len(m) for _, m in sorted_subs[12:])
            print(f"        ... +{len(sorted_subs) - 12} more sub-clusters "
                  f"({other} members)")

    if plan["unassigned_cluster_id"] is not None:
        redistrib = plan["unassigned_redistrib"]
        total_redist = sum(len(v) for v in redistrib.values())
        print()
        print(f"  [{plan['unassigned_cluster_id']}] Unassigned -> "
              f"redistribute {total_redist} concepts")
        sorted_targets = sorted(
            redistrib.items(), key=lambda x: -len(x[1])
        )[:5]
        for target_id, cids in sorted_targets:
            target = db.query(ConceptCluster).filter_by(id=target_id).first()
            tlabel = target.label if target else f"<gone:{target_id}>"
            print(f"        -> [{target_id}] {tlabel:40s} +{len(cids)} concepts")
        if len(redistrib) > 5:
            print(f"        ... +{len(redistrib) - 5} more target clusters")

    print()
    print("=" * 72)
    if plan.get("sample_mode"):
        print(f"  SAMPLE Total: {total_sub} sub-clusters "
              f"({total_members} members assigned)")
        print(f"  -> Wenn das gut aussieht: Full-Run ohne --sample starten")
    else:
        print(f"  Total: {total_sub} sub-clusters from "
              f"{len(plan['themed'])} themed Misc + Unassigned redistribution")
    print("=" * 72)


async def main():
    parser = argparse.ArgumentParser(
        description="Phase B v2: Misc-Cluster aufbrechen"
    )
    parser.add_argument(
        "--sample", type=int, default=None,
        help="Test-Mode: nur N zufaellige Concepts pro Misc-Cluster",
    )
    parser.add_argument(
        "--commit", action="store_true",
        help="Nach Preview commit ausfuehren",
    )
    parser.add_argument(
        "--yes", "-y", action="store_true",
        help="Auto-yes auf Commit-Prompt",
    )
    parser.add_argument(
        "--no-layout", action="store_true",
        help="Layout-Recompute ueberspringen",
    )
    args = parser.parse_args()

    # Safety: --sample und --commit zusammen verboten
    if args.sample and args.commit:
        log.error("--sample und --commit zusammen nicht erlaubt "
                  "(Sample ist nur Test-Mode)")
        return 1

    db = SessionLocal()
    try:
        log.info(f"Building plan {'(SAMPLE)' if args.sample else '(FULL)'} ...")
        plan = await build_plan(db, sample_size=args.sample)
        print_preview(plan, db)

        if args.sample:
            print()
            print("--sample mode: keine DB-Aenderungen. "
                  "Wenn Resultat gut aussieht, ohne --sample neu starten.")
            return 0

        if not args.commit:
            print()
            print("--commit not given. Exiting without changes.")
            print("Run with --commit --yes to apply.")
            return 0

        if not args.yes:
            print()
            answer = input("Commit this plan to DB? [y/N] ").strip().lower()
            if answer not in ("y", "yes"):
                print("Aborted, no changes made.")
                return 0

        log.info("Committing plan ...")
        name_to_id = {c.name: c.id for c in db.query(Concept).all()}
        stats = commit_plan(db, plan, name_to_id)
        print()
        print("Commit done:")
        for k, v in stats.items():
            print(f"  {k}: {v}")

        if not args.no_layout:
            log.info("Running layout recompute ...")
            rc = run_layout()
            print(f"Layout rc={rc}")
        else:
            print("Layout skipped (--no-layout).")

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
