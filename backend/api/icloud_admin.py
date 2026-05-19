"""iCloud Admin-API.

Endpoints:
- GET  /api/icloud/status          — Scheduler-Status + Calendar-Status
- POST /api/icloud/sync/trigger    — Manueller Sync (wartet auf Result)
- GET  /api/icloud/calendars       — Liste aller bekannten iCloud-Kalender
- PATCH /api/icloud/calendars/{id} — sync_enabled togglen
- DELETE /api/icloud/calendars/{id} — Soft-Delete: setzt sync_enabled=0
                                       (Kalender bleibt in DB)

Read-Only-Guard fuer Events ist NICHT hier — der lebt in calendar.py.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.icloud import ICloudCalendar
from backend.services.icloud_sync import get_calendar_stats
from backend.services import icloud_scheduler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/icloud", tags=["icloud"])


class CalendarPatch(BaseModel):
    """PATCH-Body fuer /calendars/{id}."""
    sync_enabled: bool | None = None
    pallas_color: str | None = None


@router.get("/status")
def get_status(db: Session = Depends(get_db)):
    """Gesamt-Status: Scheduler + alle Kalender."""
    scheduler = icloud_scheduler.get_status()
    calendars = get_calendar_stats(db)
    return {
        "scheduler": scheduler,
        "calendars": calendars,
    }


@router.post("/sync/trigger")
async def trigger_sync():
    """Manueller Sync-Trigger. Wartet auf Result (kann ~30s dauern).

    Wenn der Background-Scheduler gerade laeuft, wird das ignoriert —
    dieser Endpoint startet einen separaten On-Demand-Sync.
    """
    try:
        results = await icloud_scheduler.trigger_manual_sync()
        ok_count = sum(1 for r in results if r.get("ok"))
        return {
            "ok": True,
            "calendars_synced": ok_count,
            "calendars_total": len(results),
            "results": results,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Manual sync trigger failed")
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(exc)[:200]}",
        )


@router.get("/calendars")
def list_calendars(db: Session = Depends(get_db)):
    """Listet alle iCloud-Kalender mit Status."""
    return get_calendar_stats(db)


@router.patch("/calendars/{calendar_id}")
def patch_calendar(
    calendar_id: int,
    data: CalendarPatch,
    db: Session = Depends(get_db),
):
    """Updated sync_enabled oder pallas_color eines Kalenders.

    Other fields (caldav_url, name, color) sind read-only — die kommen
    vom Discovery-Sync.
    """
    cal = db.query(ICloudCalendar).filter_by(id=calendar_id).first()
    if cal is None:
        raise HTTPException(404, detail=f"Calendar {calendar_id} not found")

    changed = False
    if data.sync_enabled is not None:
        cal.sync_enabled = 1 if data.sync_enabled else 0
        changed = True
    if data.pallas_color is not None:
        cal.pallas_color = data.pallas_color
        changed = True

    if changed:
        db.commit()

    return {
        "id": cal.id,
        "name": cal.name,
        "sync_enabled": bool(cal.sync_enabled),
        "pallas_color": cal.pallas_color,
    }


@router.delete("/calendars/{calendar_id}")
def delete_calendar(
    calendar_id: int,
    db: Session = Depends(get_db),
):
    """Soft-Delete: setzt sync_enabled=0.

    Der Kalender bleibt in DB damit beim naechsten Discovery seine
    Metadaten nicht verloren gehen. Events des Kalenders bleiben in
    calendar_events erhalten (kein automatisches Prune).

    Wenn du Events auch loeschen willst: /sync/trigger danach,
    Prune wird greifen weil sync_enabled=0 = nicht mehr von iCloud
    abgefragt.
    """
    cal = db.query(ICloudCalendar).filter_by(id=calendar_id).first()
    if cal is None:
        raise HTTPException(404, detail=f"Calendar {calendar_id} not found")

    cal.sync_enabled = 0
    db.commit()
    return {
        "id": cal.id,
        "name": cal.name,
        "sync_enabled": False,
        "detail": "Soft-deleted (sync_enabled=0). Events bleiben in DB.",
    }
