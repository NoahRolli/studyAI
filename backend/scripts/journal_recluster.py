# Journal Recluster CLI Script
# Nutzung: python -m backend.scripts.journal_recluster [--flags]
#
# Volle Pipeline (default):
#   1. Embedding-Backfill: alle Eintraege ohne Embedding nachembedded
#   2. Full-Recluster: Average-Link Hierarchical Clustering
#   3. Label-Generation: LLM-Labels fuer alle Cluster
#
# Flags:
#   --embed-only      Nur Embeddings, kein Cluster
#   --cluster-only    Nur Cluster, kein Backfill
#   --no-labels       Cluster ohne Labels (schneller, fuer Tests)
#   --threshold X     Cluster-Threshold (default 0.65)
#
# Aufruf im Docker-Container:
#   docker exec -it pallas python -m backend.scripts.journal_recluster
#
# WICHTIG: Wirft ein interaktives Passwort-Prompt.
# Stelle sicher dass docker exec mit -it laeuft, sonst Fehler.

import argparse
import asyncio
import getpass
import sys

# WICHTIG: Models-Registry vor jeder DB-Operation laden
import backend.models.registry  # noqa: F401
import backend.journal.models  # noqa: F401

from backend.journal.models.journal_database import SessionLocal
from backend.journal.models.journal_entry import JournalEntry
from backend.journal.models.journal_embedding import JournalEmbedding
from backend.journal.services.crypto_service import derive_key, decrypt_text
from backend.journal.services.embedding_service import embed_and_store
from backend.journal.services.clustering_service import (
    cluster_all_entries,
    regenerate_all_labels,
    DEFAULT_THRESHOLD,
)


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


async def _backfill_embeddings(key: bytes, db) -> dict:
    """Embeddings fuer alle Entries ohne Embedding nachholen."""
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()

    existing_ids = {
        row.entry_id
        for row in db.query(JournalEmbedding.entry_id).all()
    }

    todo = [e for e in entries if e.id not in existing_ids]
    print(f"  Insgesamt {len(entries)} aktive Eintraege")
    print(f"  Davon {len(existing_ids)} bereits embedded")
    print(f"  -> {len(todo)} Eintraege zu embedden")

    success = 0
    failed = 0
    for i, entry in enumerate(todo, 1):
        try:
            title = decrypt_text(entry.encrypted_title, key)
            content = decrypt_text(entry.encrypted_content, key)
        except ValueError:
            print(f"    [{i}/{len(todo)}] Entry {entry.id}: Decrypt-Fehler, skip")
            failed += 1
            continue

        try:
            await embed_and_store(entry.id, title, content, key, db)
            success += 1
            if i % 10 == 0 or i == len(todo):
                print(f"    [{i}/{len(todo)}] embedded")
        except Exception as e:
            print(f"    [{i}/{len(todo)}] Entry {entry.id}: {type(e).__name__}: {e}")
            failed += 1

    return {"total": len(todo), "success": success, "failed": failed}


async def main():
    parser = argparse.ArgumentParser(
        description="Journal Embedding + Topic-Clustering",
    )
    parser.add_argument("--embed-only", action="store_true",
                        help="Nur Embeddings, kein Cluster")
    parser.add_argument("--cluster-only", action="store_true",
                        help="Nur Cluster, kein Embed-Backfill")
    parser.add_argument("--no-labels", action="store_true",
                        help="Cluster ohne LLM-Labels")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                        help=f"Cluster-Threshold (default {DEFAULT_THRESHOLD})")
    args = parser.parse_args()

    if args.embed_only and args.cluster_only:
        print("FEHLER: --embed-only und --cluster-only schliessen sich aus.",
              file=sys.stderr)
        sys.exit(2)

    key = _prompt_password()
    db = SessionLocal()

    try:
        # Schritt 1: Embedding-Backfill
        if not args.cluster_only:
            print("\n=== Embedding-Backfill ===")
            stats = await _backfill_embeddings(key, db)
            print(f"  Fertig: {stats['success']} ok, {stats['failed']} fehlgeschlagen")

        if args.embed_only:
            print("\n--embed-only gesetzt, fertig.")
            return

        # Schritt 2: Full-Recluster
        print(f"\n=== Full-Recluster (threshold={args.threshold}) ===")
        result = await cluster_all_entries(key, db, threshold=args.threshold)
        print(f"  Status: {result['status']}")
        print(f"  Embeddings verarbeitet: {result['embedding_count']}")
        print(f"  Cluster gebildet: {result['cluster_count']}")

        if result["cluster_count"] == 0:
            print("\nKeine Cluster gebildet. Pruefe Threshold oder Datenmenge.")
            return

        # Schritt 3: Label-Generation
        if not args.no_labels:
            print("\n=== Label-Generation ===")
            count = await regenerate_all_labels(key, db, language="de")
            print(f"  {count} Cluster gelabelt")
        else:
            print("\n--no-labels gesetzt, Labels uebersprungen.")

        print("\nDone.")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
