#!/usr/bin/env python3
"""Sport-Tracker — Schema Migration (One-Shot).

Erweitert sport_entries um die Spalte muscle_groups.
Idempotent: kann mehrfach laufen ohne Fehler.

Usage:
    python3 -m scripts.sport_alter_tables

Was passiert:
    1. sport_entries kriegt eine neue Spalte muscle_groups (TEXT, JSON-Array)
"""
import sys
import sqlite3
from pathlib import Path

# Pallas-Root in sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.infra.config import DB_PATH  # noqa: E402


# Spalten die ergaenzt werden (idempotent via PRAGMA-Check)
NEW_COLUMNS_SPORT_ENTRIES = [
    # Trainierte Muskelgruppen als JSON-Array-Text, z.B. '["Brust","Trizeps"]'
    ("muscle_groups", "TEXT"),
]


def get_existing_columns(conn, table_name: str) -> set:
    """Liefert Spalten-Namen einer Tabelle."""
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {r[1] for r in rows}


def main():
    print(f"DB Path: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)

    try:
        existing = get_existing_columns(conn, "sport_entries")
        print(f"\nsport_entries: existing columns: {len(existing)}")

        added = 0
        skipped = 0
        for col_name, col_def in NEW_COLUMNS_SPORT_ENTRIES:
            if col_name in existing:
                print(f"  - {col_name}: SKIP (already exists)")
                skipped += 1
                continue
            sql = f"ALTER TABLE sport_entries ADD COLUMN {col_name} {col_def}"
            conn.execute(sql)
            print(f"  + {col_name}: ADDED ({col_def})")
            added += 1

        print(f"sport_entries: {added} added, {skipped} skipped")

        conn.commit()

        # Verifikation
        print()
        print("=" * 60)
        print("VERIFICATION")
        print("=" * 60)

        final_cols = get_existing_columns(conn, "sport_entries")
        print(f"sport_entries: {len(final_cols)} columns total")
        if "muscle_groups" in final_cols:
            print("muscle_groups: EXISTS")
        else:
            print("muscle_groups: MISSING — something went wrong")
            return 1

        print()
        print("Migration done successfully.")
        return 0

    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
