#!/usr/bin/env python3
"""iCloud Phase 1B — Connect-Test + Calendar-Discovery.

Phase 1B-Validierung:
    1. Pingt iCloud-CalDAV an (Auth-Check)
    2. Listet alle gefundenen Kalender mit Color
    3. Upsertet sie in icloud_calendars

Usage:
    python3 -m scripts.icloud_test_connect

    # Nur listen ohne DB-Write:
    python3 -m scripts.icloud_test_connect --dry-run

Voraussetzungen:
    - ENV-Vars ICLOUD_APPLE_ID + ICLOUD_APP_PASSWORD gesetzt
    - Schema-Migration gelaufen (icloud_alter_tables.py)
"""
import argparse
import logging
import sys
from pathlib import Path

# Pallas-Root in sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Registry-Trigger vor allen Model-Imports
from backend.models import registry  # noqa: F401, E402
from backend.models.database import SessionLocal  # noqa: E402
from backend.infra.config import (  # noqa: E402
    ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD,
)
from backend.services.icloud_client import (  # noqa: E402
    ICloudClient, ICloudConnectionError,
)
from backend.services.icloud_sync import (  # noqa: E402
    discover_calendars, get_calendar_stats,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("icloud-test")


def print_calendars(cals: list[dict]) -> None:
    """Schoene Tabelle der gefundenen Kalender."""
    print()
    print("=" * 80)
    print(f"  {'ID':>4}  {'Name':30s}  {'Color':10s}  {'Events':>6}  Sync")
    print("=" * 80)
    for c in cals:
        color = c.get("color") or "—"
        sync = "ON" if c.get("sync_enabled", True) else "OFF"
        events = c.get("event_count", 0)
        cid = c.get("id", "?")
        print(f"  {cid:>4}  {c['name']:30s}  {color:10s}  "
              f"{events:>6}  {sync}")
    print("=" * 80)
    print()


def main():
    parser = argparse.ArgumentParser(
        description="iCloud Phase 1B Connect-Test"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Nur listen, kein DB-Write",
    )
    args = parser.parse_args()

    # ENV-Check
    if not ICLOUD_APPLE_ID:
        log.error("ICLOUD_APPLE_ID nicht gesetzt — abort")
        log.error("Setze in docker-compose.override.yml:")
        log.error("  - ICLOUD_APPLE_ID=deine@apple.id")
        log.error("  - ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx")
        return 1
    if not ICLOUD_APP_PASSWORD:
        log.error("ICLOUD_APP_PASSWORD nicht gesetzt — abort")
        return 1

    log.info(f"Connecting as {ICLOUD_APPLE_ID} ...")

    # Connection-Test
    try:
        client = ICloudClient(ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD)
        info = client.test_connection()
        log.info(f"Connection OK")
        log.info(f"  Principal: {info['principal_url']}")
        log.info(f"  Calendars: {info['calendar_count']} gefunden")
    except ICloudConnectionError as e:
        log.error(f"Connection FAILED: {e}")
        return 1

    if args.dry_run:
        log.info("DRY-RUN: liste Kalender, schreibe nichts in DB.")
        cals = client.list_calendars()
        # Render im erwarteten Format
        for i, c in enumerate(cals, 1):
            c["id"] = i
            c["event_count"] = 0
            c["sync_enabled"] = True
        print_calendars(cals)
        return 0

    # Discovery in DB
    db = SessionLocal()
    try:
        log.info("Running calendar discovery ...")
        result = discover_calendars(db)
        log.info(
            f"Discovery: {result['inserted']} new, "
            f"{result['updated']} updated, "
            f"{result['total']} total"
        )

        log.info("Calendar status:")
        stats = get_calendar_stats(db)
        print_calendars(stats)

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
