# Journal Inspect CLI — read-only Diagnose fuer Cluster + Embeddings
#
# Nutzung im Container:
#   docker exec -it pallas python -m backend.scripts.journal_inspect
#   docker exec -it pallas python -m backend.scripts.journal_inspect --cluster 2
#
# Default-View: alle Cluster mit Label, Cohesion, Member-IDs.
# --cluster N:  Member-Titles eines Clusters decrypten und anzeigen.
#
# WICHTIG: Read-only. Schreibt nichts in die DB.

import argparse
import getpass
import sys

# Models-Registry vor jeder DB-Operation laden
import backend.models.registry  # noqa: F401
import backend.journal.models  # noqa: F401

from backend.journal.models.journal_database import SessionLocal
from backend.journal.models.journal_topic_cluster import (
    JournalTopicCluster,
    JournalEntryClusterMembership,
)
from backend.journal.models.journal_entry import JournalEntry
from backend.journal.services.crypto_service import derive_key, decrypt_text


def _prompt_password() -> bytes:
    """Interaktives Passwort-Prompt mit TTY-Check."""
    if not sys.stdin.isatty():
        print(
            "FEHLER: Kein TTY verfuegbar. "
            "Nutze 'docker exec -it pallas ...' statt nur 'docker exec'.",
            file=sys.stderr,
        )
        sys.exit(2)
    pwd = getpass.getpass("Journal-Passwort: ")
    if not pwd:
        print("FEHLER: Leeres Passwort.", file=sys.stderr)
        sys.exit(2)
    return derive_key(pwd)


def _show_overview(key: bytes, db) -> None:
    """Default-View: alle Cluster mit Label + Members."""
    clusters = db.query(JournalTopicCluster).order_by(
        JournalTopicCluster.entry_count.desc()
    ).all()

    if not clusters:
        print("Keine Cluster vorhanden. Erst journal_recluster laufen lassen.")
        return

    print(f"=== {len(clusters)} Cluster ===\n")
    for c in clusters:
        try:
            label = decrypt_text(c.encrypted_label, key) if c.encrypted_label else "(no label)"
        except ValueError:
            label = "DECRYPT_FAILED"

        members = db.query(JournalEntryClusterMembership.entry_id).filter(
            JournalEntryClusterMembership.cluster_id == c.id
        ).order_by(JournalEntryClusterMembership.entry_id).all()
        member_ids = [m.entry_id for m in members]

        print(f"Cluster {c.id:>2}: {label}")
        print(f"  n={c.entry_count}  cohesion={c.cohesion:.3f}")
        print(f"  entries: {member_ids}")
        print()


def _show_cluster(cluster_id: int, key: bytes, db) -> None:
    """Detail-View: Member-Titles decrypten."""
    cluster = db.query(JournalTopicCluster).filter(
        JournalTopicCluster.id == cluster_id
    ).first()

    if not cluster:
        print(f"FEHLER: Cluster {cluster_id} nicht gefunden.", file=sys.stderr)
        sys.exit(1)

    try:
        label = decrypt_text(cluster.encrypted_label, key) if cluster.encrypted_label else "(no label)"
    except ValueError:
        label = "DECRYPT_FAILED"

    print(f"=== Cluster {cluster_id}: {label} ===")
    print(f"  cohesion={cluster.cohesion:.3f}  n={cluster.entry_count}\n")

    memberships = db.query(JournalEntryClusterMembership).filter(
        JournalEntryClusterMembership.cluster_id == cluster_id
    ).order_by(JournalEntryClusterMembership.similarity_to_centroid.desc()).all()

    for m in memberships:
        entry = db.query(JournalEntry).filter(JournalEntry.id == m.entry_id).first()
        if not entry:
            print(f"  [{m.entry_id}] (entry not found)")
            continue
        try:
            title = decrypt_text(entry.encrypted_title, key)
        except ValueError:
            title = "DECRYPT_FAILED"
        sim = m.similarity_to_centroid
        print(f"  [{m.entry_id:>3}] sim={sim:.3f}  {title[:70]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Journal Inspect — Cluster-Diagnose")
    parser.add_argument(
        "--cluster",
        type=int,
        default=None,
        help="Detail-View fuer bestimmten Cluster (zeigt Member-Titles)",
    )
    args = parser.parse_args()

    key = _prompt_password()
    db = SessionLocal()
    try:
        if args.cluster is not None:
            _show_cluster(args.cluster, key, db)
        else:
            _show_overview(key, db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
