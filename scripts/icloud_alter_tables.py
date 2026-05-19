#!/usr/bin/env python3
"""iCloud Sync — Schema Migration (One-Shot).

Erweitert calendar_events um iCloud-Sync-Felder und legt
icloud_calendars-Tabelle an. Idempotent: kann mehrfach laufen
ohne Fehler.

Usage:
    python3 -m scripts.icloud_alter_tables

Was passiert:
    1. calendar_events kriegt 10 neue Spalten (source, external_uid, ...)
    2. icloud_calendars Tabelle wird angelegt
    3. Indizes fuer effiziente Sync-Operationen
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
NEW_COLUMNS_CALENDAR_EVENTS = [
    # Sync-Tracking
    ("source", "TEXT NOT NULL DEFAULT 'manual'"),
    ("external_uid", "TEXT"),
    ("external_calendar_id", "INTEGER"),
    ("external_etag", "TEXT"),
    ("recurrence_id", "TEXT"),
    ("is_readonly", "INTEGER NOT NULL DEFAULT 0"),
    ("last_synced", "DATETIME"),
    # iCloud-Reichdaten
    ("location", "TEXT"),
    ("timezone", "TEXT"),
    ("raw_ical", "TEXT"),
]


CREATE_ICLOUD_CALENDARS = """
CREATE TABLE IF NOT EXISTS icloud_calendars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caldav_url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT,
    pallas_color TEXT,
    sync_token TEXT,
    sync_enabled INTEGER NOT NULL DEFAULT 1,
    last_sync DATETIME,
    last_error TEXT,
    event_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

# Indizes
INDEXES = [
    # Unique-Constraint fuer iCloud-Event-Idempotenz
    # (Eine Event-Instanz: source + external_uid + recurrence_id muss unique sein)
    """CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external
       ON calendar_events(source, external_uid, recurrence_id)
       WHERE source != 'manual'""",
    # Schnelle Zeit-Queries (Delphi-Tools)
    """CREATE INDEX IF NOT EXISTS idx_calendar_events_start
       ON calendar_events(start_time)""",
    # Schnelles Filtern nach Kalender
    """CREATE INDEX IF NOT EXISTS idx_calendar_events_external_cal
       ON calendar_events(external_calendar_id)""",
]


def get_existing_columns(conn, table_name: str) -> set:
    """Liefert Spalten-Namen einer Tabelle."""
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {r[1] for r in rows}


def main():
    print(f"DB Path: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)

    try:
        # 1. calendar_events erweitern
        existing = get_existing_columns(conn, "calendar_events")
        print(f"\ncalendar_events: existing columns: {len(existing)}")

        added = 0
        skipped = 0
        for col_name, col_def in NEW_COLUMNS_CALENDAR_EVENTS:
            if col_name in existing:
                print(f"  - {col_name}: SKIP (already exists)")
                skipped += 1
                continue
            sql = f"ALTER TABLE calendar_events ADD COLUMN {col_name} {col_def}"
            conn.execute(sql)
            print(f"  + {col_name}: ADDED ({col_def})")
            added += 1

        print(f"calendar_events: {added} added, {skipped} skipped")

        # 2. icloud_calendars anlegen
        print()
        conn.execute(CREATE_ICLOUD_CALENDARS)
        print("icloud_calendars: CREATE IF NOT EXISTS done")

        # 3. Indizes
        print()
        for idx_sql in INDEXES:
            conn.execute(idx_sql)
            # Index-Name extrahieren fuer Log
            name_part = idx_sql.split("INDEX IF NOT EXISTS ")[1].split()[0]
            print(f"  Index: {name_part}")

        conn.commit()

        # 4. Verifikation
        print()
        print("=" * 60)
        print("VERIFICATION")
        print("=" * 60)

        final_cols = get_existing_columns(conn, "calendar_events")
        print(f"calendar_events: {len(final_cols)} columns total")

        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='icloud_calendars'"
        ).fetchall()
        if tables:
            print("icloud_calendars: EXISTS")
        else:
            print("icloud_calendars: MISSING — something went wrong")
            return 1

        # Index-Liste
        indices = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' "
            "AND tbl_name='calendar_events' AND name LIKE 'idx_%'"
        ).fetchall()
        print(f"calendar_events indices: {[r[0] for r in indices]}")

        print()
        print("Migration done successfully.")
        return 0

    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
