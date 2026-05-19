"""iCloud Sync — Discovery + Event-Sync.

Phase 1B (DONE): discover_calendars()
Phase 1C (NEW):  full_sync() pro Kalender mit expand=True

Pattern:
- Read-Phase: alle Events aus iCloud holen
- Upsert-Phase: pro Event SELECT existing → UPDATE oder INSERT
- Prune-Phase: Events mit last_synced < sync_started_at = in iCloud weg → DELETE
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from backend.infra.config import (
    ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD,
    ICLOUD_SYNC_WINDOW_MONTHS,
)
from backend.models.icloud import ICloudCalendar
from backend.models.calendar_event import CalendarEvent
from backend.services.icloud_client import (
    ICloudClient,
    ICloudConnectionError,
)

logger = logging.getLogger(__name__)


def _get_client() -> ICloudClient:
    """Helper: ICloudClient mit Config-Credentials."""
    if not ICLOUD_APPLE_ID or not ICLOUD_APP_PASSWORD:
        raise ICloudConnectionError(
            "ICLOUD_APPLE_ID und ICLOUD_APP_PASSWORD muessen gesetzt sein"
        )
    return ICloudClient(ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD)


def discover_calendars(db: Session) -> dict:
    """Listet iCloud-Kalender und upsertet sie in icloud_calendars.

    Idempotent: zweiter Aufruf erkennt bestehende Kalender per
    caldav_url (UNIQUE) und updated Name + Color falls geaendert.
    """
    client = _get_client()
    found = client.list_calendars()
    logger.info(f"iCloud Discovery: {len(found)} Kalender gefunden")

    inserted = updated = 0
    for cal_data in found:
        url = cal_data["url"]
        name = cal_data["name"]
        color = cal_data["color"]

        existing = db.query(ICloudCalendar).filter_by(caldav_url=url).first()
        if existing is None:
            db.add(ICloudCalendar(
                caldav_url=url, name=name, color=color, sync_enabled=1,
            ))
            inserted += 1
            logger.info(f"  + NEU: '{name}' ({url[:60]}...)")
        else:
            changed = False
            if existing.name != name:
                logger.info(f"  ~ '{existing.name}' -> '{name}'")
                existing.name = name
                changed = True
            if existing.color != color:
                existing.color = color
                changed = True
            if changed:
                updated += 1

    db.commit()
    logger.info(
        f"Discovery done: {inserted} new, {updated} updated, "
        f"{len(found)} total iCloud calendars in DB"
    )
    return {"inserted": inserted, "updated": updated, "total": len(found)}


def get_calendar_stats(db: Session) -> list[dict]:
    """Listet alle bekannten iCloud-Kalender mit Status."""
    cals = db.query(ICloudCalendar).order_by(ICloudCalendar.id).all()
    return [
        {
            "id": c.id, "name": c.name, "url": c.caldav_url,
            "color": c.color, "sync_enabled": bool(c.sync_enabled),
            "event_count": c.event_count,
            "last_sync": c.last_sync.isoformat() if c.last_sync else None,
            "last_error": c.last_error,
        }
        for c in cals
    ]


# ============================================================
# Phase 1C: Event-Sync
# ============================================================


def _to_datetime(val) -> Optional[datetime]:
    """VEVENT-Datum normalisieren — sowohl date als auch datetime.

    Whole-day events kommen als date, normale als datetime.
    """
    if val is None:
        return None
    if hasattr(val, "dt"):
        val = val.dt
    if isinstance(val, datetime):
        # naive datetime → UTC angenommen
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    # date-only (whole-day)
    return datetime(val.year, val.month, val.day, tzinfo=timezone.utc)


def _ical_to_dict(component, calendar_id: int, etag: str | None) -> dict:
    """VEVENT → CalendarEvent-Row-Dict.

    Extrahiert:
    - Pflicht: UID, DTSTART, SUMMARY
    - Optional: DTEND, DESCRIPTION, LOCATION, TZID
    - Recurrence-ID falls vorhanden (sonst NULL)
    - Rest in raw_ical (JSON-Blob)
    """
    uid = str(component.get("UID", ""))
    summary = str(component.get("SUMMARY", "")).strip() or "(no title)"
    description = component.get("DESCRIPTION")
    description = str(description) if description else None
    location = component.get("LOCATION")
    location = str(location) if location else None

    dtstart = _to_datetime(component.get("DTSTART"))
    dtend = _to_datetime(component.get("DTEND"))

    # All-day Detection
    raw_dtstart = component.get("DTSTART")
    all_day = bool(raw_dtstart and hasattr(raw_dtstart, "dt")
                   and not isinstance(raw_dtstart.dt, datetime))

    # Timezone aus DTSTART params
    tzid = None
    if raw_dtstart and hasattr(raw_dtstart, "params"):
        tzid = raw_dtstart.params.get("TZID")

    # Recurrence-ID: ISO-Datum-String wenn vorhanden
    recurrence_id = None
    rec_id = component.get("RECURRENCE-ID")
    if rec_id:
        rec_dt = _to_datetime(rec_id)
        if rec_dt:
            recurrence_id = rec_dt.isoformat()

    # Raw-iCal als JSON-Blob (alles was nicht in Spalten ist)
    raw_dict = {}
    for key in ("ORGANIZER", "ATTENDEE", "CATEGORIES", "STATUS",
                "URL", "PRIORITY"):
        if key in component:
            val = component[key]
            if isinstance(val, list):
                raw_dict[key] = [str(v) for v in val]
            else:
                raw_dict[key] = str(val)
    raw_ical = json.dumps(raw_dict) if raw_dict else None

    return {
        "title": summary,
        "description": description,
        "start_time": dtstart,
        "end_time": dtend,
        "all_day": all_day,
        "color": "cyan",  # iCloud-Events kriegen Default-Color
        "recurrence": "none",  # expand=True → keine Pallas-Recurrence
        "source": "icloud",
        "external_uid": uid,
        "external_calendar_id": calendar_id,
        "external_etag": etag,
        "recurrence_id": recurrence_id,
        "is_readonly": 1,
        "location": location,
        "timezone": tzid,
        "raw_ical": raw_ical,
    }


def _upsert_event(db: Session, event_data: dict, sync_started_at: datetime):
    """Upsert via SELECT-first-Pattern, gibt 'inserted'/'updated' zurueck."""
    existing = db.query(CalendarEvent).filter_by(
        source="icloud",
        external_uid=event_data["external_uid"],
        recurrence_id=event_data["recurrence_id"],
    ).first()

    event_data["last_synced"] = sync_started_at

    if existing is None:
        db.add(CalendarEvent(**event_data))
        return "inserted"

    # ETag-Check spart Re-Writes — wenn unchanged, nur last_synced touch
    if (existing.external_etag and existing.external_etag
            == event_data["external_etag"]):
        existing.last_synced = sync_started_at
        return "unchanged"

    # Update aller Felder
    for k, v in event_data.items():
        setattr(existing, k, v)
    return "updated"


def _prune_stale(db: Session, calendar_id: int,
                 sync_started_at: datetime) -> int:
    """Loescht iCloud-Events die in iCloud nicht mehr existieren."""
    stale = db.query(CalendarEvent).filter(
        CalendarEvent.source == "icloud",
        CalendarEvent.external_calendar_id == calendar_id,
        CalendarEvent.last_synced < sync_started_at,
    ).all()
    count = len(stale)
    for ev in stale:
        db.delete(ev)
    return count


def full_sync(db: Session, calendar_id: int,
              window_months: int | None = None) -> dict:
    """Full-Sync eines iCloud-Kalenders mit expand=True.

    Args:
        calendar_id: PK in icloud_calendars
        window_months: wie weit in die Zukunft syncen
                       (default aus config: ICLOUD_SYNC_WINDOW_MONTHS)

    Returns:
        Stats-Dict mit inserted/updated/unchanged/pruned + Fehler-Info
    """
    cal = db.query(ICloudCalendar).filter_by(id=calendar_id).first()
    if cal is None:
        raise ValueError(f"Calendar {calendar_id} not found")
    if not cal.sync_enabled:
        logger.info(f"Calendar {cal.name} disabled — skip")
        return {"skipped": True, "calendar": cal.name}

    months = window_months or ICLOUD_SYNC_WINDOW_MONTHS
    sync_started_at = datetime.utcnow()
    start = sync_started_at - timedelta(days=7)
    end = sync_started_at + timedelta(days=30 * months)

    logger.info(
        f"Full-Sync '{cal.name}' [{start.date()} .. {end.date()}] ..."
    )

    client = _get_client()
    inserted = updated = unchanged = errored = 0

    try:
        events = client.fetch_events(cal.caldav_url, start, end)
        for ev in events:
            try:
                comp = ev.icalendar_component
                etag = getattr(ev, "etag", None)
                if etag:
                    etag = str(etag).strip('"')
                event_data = _ical_to_dict(comp, cal.id, etag)
                # Skip Events ohne DTSTART (selten, aber moeglich)
                if event_data["start_time"] is None:
                    continue
                result = _upsert_event(db, event_data, sync_started_at)
                if result == "inserted":
                    inserted += 1
                elif result == "updated":
                    updated += 1
                else:
                    unchanged += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"Skipping bad event in {cal.name}: {exc}")
                errored += 1

        # Prune: Events die jetzt fehlen
        pruned = _prune_stale(db, cal.id, sync_started_at)

        # Cal-Metadaten aktualisieren
        cal.last_sync = sync_started_at
        cal.last_error = None
        cal.event_count = db.query(CalendarEvent).filter_by(
            external_calendar_id=cal.id, source="icloud"
        ).count()
        db.commit()

        logger.info(
            f"'{cal.name}' done: +{inserted} ~{updated} ={unchanged} "
            f"-{pruned} (errors: {errored})"
        )
        return {
            "calendar": cal.name, "inserted": inserted, "updated": updated,
            "unchanged": unchanged, "pruned": pruned, "errors": errored,
            "event_count": cal.event_count,
        }

    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Sync failed for '{cal.name}'")
        cal.last_error = str(exc)[:500]
        cal.last_sync = sync_started_at
        db.commit()
        raise


def sync_all_enabled(db: Session, window_months: int | None = None) -> list[dict]:
    """Sync alle Kalender mit sync_enabled=1. Sammelt Fehler statt zu crashen."""
    cals = db.query(ICloudCalendar).filter_by(sync_enabled=1).order_by(
        ICloudCalendar.id
    ).all()
    results = []
    for cal in cals:
        try:
            stats = full_sync(db, cal.id, window_months)
            results.append({"ok": True, **stats})
        except Exception as exc:  # noqa: BLE001
            results.append({
                "ok": False, "calendar": cal.name, "error": str(exc)[:200],
            })
    return results
