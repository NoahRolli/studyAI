#!/usr/bin/env python3
"""iCloud Event-Sync CLI.

Usage:
    # Alle enabled Kalender syncen:
    python3 -m scripts.icloud_sync_now

    # Nur einen Kalender:
    python3 -m scripts.icloud_sync_now --calendar 5

    # Anderes Window:
    python3 -m scripts.icloud_sync_now --window-months 12

Voraussetzungen:
    - Schema-Migration gelaufen
    - icloud_test_connect erfolgreich (Kalender in DB)
    - ENV-Vars gesetzt
"""
import argparse
import logging
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from backend.models import registry  # noqa: F401, E402
from backend.models.database import SessionLocal  # noqa: E402
from backend.services.icloud_sync import (  # noqa: E402
    full_sync, sync_all_enabled,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("icloud-sync")


def print_results(results: list[dict]) -> None:
    """Tabellarische Zusammenfassung."""
    print()
    print("=" * 78)
    print(f"  {'Calendar':25s}  {'+':>5}  {'~':>5}  {'=':>5}  "
          f"{'-':>5}  {'!':>3}  Total")
    print("=" * 78)
    for r in results:
        name = r.get("calendar", "?")[:25]
        if not r.get("ok", True):
            print(f"  {name:25s}  FAILED: {r.get('error', '?')[:40]}")
            continue
        if r.get("skipped"):
            print(f"  {name:25s}  SKIPPED (disabled)")
            continue
        ins = r.get("inserted", 0)
        upd = r.get("updated", 0)
        unc = r.get("unchanged", 0)
        prn = r.get("pruned", 0)
        err = r.get("errors", 0)
        cnt = r.get("event_count", 0)
        print(f"  {name:25s}  {ins:>5}  {upd:>5}  {unc:>5}  "
              f"{prn:>5}  {err:>3}  {cnt:>5}")
    print("=" * 78)
    print("  Legende: + Insert, ~ Update, = Unchanged, "
          "- Pruned, ! Errors, Total = Events in DB")
    print()


def main():
    parser = argparse.ArgumentParser(description="iCloud Event-Sync")
    parser.add_argument(
        "--calendar", type=int, default=None,
        help="ID des Kalenders (sonst: alle enabled)",
    )
    parser.add_argument(
        "--window-months", type=int, default=None,
        help="Sync-Fenster in Monaten (default: aus config)",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        t0 = time.time()
        if args.calendar:
            log.info(f"Sync calendar {args.calendar} ...")
            stats = full_sync(db, args.calendar, args.window_months)
            print_results([{"ok": True, **stats}])
        else:
            log.info("Sync all enabled calendars ...")
            results = sync_all_enabled(db, args.window_months)
            print_results(results)

        log.info(f"Total runtime: {time.time() - t0:.1f}s")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
