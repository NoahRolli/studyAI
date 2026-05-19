"""iCloud Background-Scheduler.

Architektur:
- start_scheduler() wird von main.py beim FastAPI-Startup aufgerufen
- Loop: warte SYNC_INTERVAL_MIN, dann sync_all_enabled
- Initial-Sync sofort nach Start (User-friendly default)
- Single-Instance via Module-Level-Flag
- Graceful Shutdown via Cancel-Event

Status sichtbar in icloud_calendars.last_sync + last_error.
"""

import asyncio
import logging
from datetime import datetime

from backend.infra.config import (
    ICLOUD_ENABLED,
    ICLOUD_APPLE_ID,
    ICLOUD_APP_PASSWORD,
    ICLOUD_SYNC_INTERVAL_MIN,
)
from backend.models.database import SessionLocal
from backend.services.icloud_sync import sync_all_enabled

logger = logging.getLogger(__name__)

# Module-Level-Singletons
_task: asyncio.Task | None = None
_stop_event: asyncio.Event | None = None
_last_run: datetime | None = None
_last_results: list[dict] = []


def is_running() -> bool:
    """Checkt ob der Scheduler-Loop laeuft."""
    return _task is not None and not _task.done()


def get_status() -> dict:
    """Diagnose-Info fuer Admin-Endpoints."""
    return {
        "enabled": ICLOUD_ENABLED,
        "running": is_running(),
        "interval_min": ICLOUD_SYNC_INTERVAL_MIN,
        "last_run": _last_run.isoformat() if _last_run else None,
        "last_results": _last_results,
    }


async def _scheduler_loop():
    """Forever-Loop. Bricht ab wenn _stop_event gesetzt."""
    global _last_run, _last_results

    # Initial-Sync sofort
    logger.info("iCloud-Scheduler: initial sync starting")
    await _run_once()

    while not _stop_event.is_set():
        # Warte bis Intervall oder Stop
        try:
            await asyncio.wait_for(
                _stop_event.wait(),
                timeout=ICLOUD_SYNC_INTERVAL_MIN * 60,
            )
            break  # _stop_event wurde gesetzt
        except asyncio.TimeoutError:
            pass  # Intervall abgelaufen, weiter machen

        if _stop_event.is_set():
            break

        await _run_once()

    logger.info("iCloud-Scheduler: loop exited")


async def _run_once():
    """Ein Sync-Durchlauf ueber alle enabled calendars."""
    global _last_run, _last_results

    db = SessionLocal()
    try:
        _last_run = datetime.utcnow()
        logger.info("iCloud-Scheduler: running sync_all_enabled")
        # sync_all_enabled ist synchron, in Thread-Pool ausfuehren
        # (vermeidet Block des Async-Event-Loops)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, sync_all_enabled, db)
        _last_results = results
        ok_count = sum(1 for r in results if r.get("ok"))
        logger.info(
            f"iCloud-Scheduler: {ok_count}/{len(results)} calendars ok"
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("iCloud-Scheduler: run failed")
        _last_results = [{"ok": False, "error": str(exc)[:200]}]
    finally:
        db.close()


def start_scheduler():
    """Startet Scheduler-Task. Idempotent.

    Wird von main.py @app.on_event('startup') aufgerufen.
    """
    global _task, _stop_event

    if not ICLOUD_ENABLED:
        logger.info("iCloud-Scheduler: disabled (ICLOUD_ENABLED=false)")
        return

    if not ICLOUD_APPLE_ID or not ICLOUD_APP_PASSWORD:
        logger.warning(
            "iCloud-Scheduler: ICLOUD_APPLE_ID/APP_PASSWORD not set, "
            "scheduler will not start"
        )
        return

    if is_running():
        logger.warning("iCloud-Scheduler: already running, skip")
        return

    _stop_event = asyncio.Event()
    _task = asyncio.create_task(_scheduler_loop())
    logger.info(
        f"iCloud-Scheduler: started, interval {ICLOUD_SYNC_INTERVAL_MIN}min"
    )


async def stop_scheduler():
    """Stoppt Scheduler-Task. Wird beim shutdown aufgerufen."""
    global _task, _stop_event

    if not is_running():
        return

    if _stop_event is not None:
        _stop_event.set()

    if _task is not None:
        try:
            await asyncio.wait_for(_task, timeout=10.0)
        except asyncio.TimeoutError:
            logger.warning("iCloud-Scheduler: shutdown timeout, cancelling")
            _task.cancel()

    _task = None
    _stop_event = None
    logger.info("iCloud-Scheduler: stopped")


async def trigger_manual_sync() -> list[dict]:
    """Manueller Trigger fuer GET /api/icloud/sync/trigger.

    Wartet auf Resultat (anders als Background-Loop).
    """
    await _run_once()
    return _last_results
