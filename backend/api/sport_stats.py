# Sport Statistics API — Aggregierte Statistiken für /sport-Seite und Kalender-Widget
# Read-only: zwei Endpoints, getrennt von sport.py (CRUD)
# Aggregation laeuft in Python (eine SQL-Query, dann in-memory) — bei kleiner Datenmenge schneller und lesbarer

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.sport_entry import SportEntry

router = APIRouter(prefix="/api/sport", tags=["sport"])


# --- Schemas ---

class SportTypeInfo(BaseModel):
    """Sport-Typ mit Haeufigkeit fuer Autocomplete."""
    type: str
    count: int
    last_used: Optional[date]


class StatsSummary(BaseModel):
    """Kennzahlen fuer das Range-Fenster."""
    total_sessions: int
    total_minutes: int
    active_days: int


class TypeBreakdown(BaseModel):
    """Aggregation pro Sport-Typ."""
    type: str
    sessions: int
    minutes: int
    avg_intensity: Optional[float]


class TimelinePoint(BaseModel):
    """Ein Punkt im Wochen-/Monatsverlauf."""
    period: str
    sessions: int
    minutes: int


class WeekdayHeatmapPoint(BaseModel):
    """Heatmap-Zelle: Wochentag x Sport-Typ."""
    weekday: int
    type: str
    count: int


class IntensityHistogramPoint(BaseModel):
    """Intensitaets-Verteilung pro Sport-Typ."""
    type: str
    intensity: int
    count: int


class SportStats(BaseModel):
    """Komplette Statistik fuer ein Zeitfenster — alle Charts in einem Request."""
    range: str
    granularity: Literal["daily", "monthly"]
    summary: StatsSummary
    by_type: list[TypeBreakdown]
    timeline: list[TimelinePoint]
    weekday_heatmap: list[WeekdayHeatmapPoint]
    intensity_histogram: list[IntensityHistogramPoint]


# --- Endpoints ---

@router.get("/types", response_model=list[SportTypeInfo])
def list_sport_types(db: Session = Depends(get_db)):
    """Alle Sport-Typen mit Haeufigkeit und letzter Nutzung.

    Sortiert nach: haeufigster zuerst, bei Gleichstand zuletzt benutzter zuerst.
    Fuer Autocomplete-Dropdown im Sport-Eingabeformular.
    """
    rows = (
        db.query(
            SportEntry.sport_type,
            func.count(SportEntry.id).label("count"),
            func.max(SportEntry.date).label("last_used"),
        )
        .group_by(SportEntry.sport_type)
        .order_by(func.count(SportEntry.id).desc(), func.max(SportEntry.date).desc())
        .all()
    )
    return [
        SportTypeInfo(type=r.sport_type, count=r.count, last_used=r.last_used)
        for r in rows
    ]


@router.get("/stats", response_model=SportStats)
def get_sport_stats(
    range: Literal["30d", "12m", "all"] = Query("30d"),
    db: Session = Depends(get_db),
):
    """Aggregierte Statistik fuer ein Zeitfenster.

    range='30d'  -> letzte 30 Tage, daily timeline
    range='12m'  -> letzte 12 Monate, monthly timeline
    range='all'  -> alle Eintraege, monthly timeline

    Liefert alle Charts in einer Antwort — ein Roundtrip, konsistenter Snapshot.
    """
    today = date.today()

    # Zeitfenster bestimmen
    if range == "30d":
        start: Optional[date] = today - timedelta(days=29)
        granularity: Literal["daily", "monthly"] = "daily"
    elif range == "12m":
        start = today - timedelta(days=365)
        granularity = "monthly"
    else:
        start = None
        granularity = "monthly"

    # Eine Query, dann in Python aggregieren
    q = db.query(SportEntry)
    if start is not None:
        q = q.filter(SportEntry.date >= start)
    entries = q.all()

    # --- summary ---
    total_minutes = sum(e.duration_min for e in entries if e.duration_min)
    active_days = len({e.date for e in entries})
    summary = StatsSummary(
        total_sessions=len(entries),
        total_minutes=total_minutes,
        active_days=active_days,
    )

    # --- by_type ---
    type_buckets: dict[str, dict] = defaultdict(
        lambda: {"sessions": 0, "minutes": 0, "intensities": []}
    )
    for e in entries:
        b = type_buckets[e.sport_type]
        b["sessions"] += 1
        if e.duration_min:
            b["minutes"] += e.duration_min
        if e.intensity is not None:
            b["intensities"].append(e.intensity)

    by_type = [
        TypeBreakdown(
            type=t,
            sessions=b["sessions"],
            minutes=b["minutes"],
            avg_intensity=round(sum(b["intensities"]) / len(b["intensities"]), 2)
            if b["intensities"]
            else None,
        )
        for t, b in sorted(type_buckets.items(), key=lambda kv: kv[1]["sessions"], reverse=True)
    ]

    # --- timeline ---
    timeline = _build_timeline(entries, start, today, granularity)

    # --- weekday_heatmap ---
    weekday_buckets: dict = defaultdict(int)
    for e in entries:
        weekday_buckets[(e.date.weekday(), e.sport_type)] += 1
    weekday_heatmap = [
        WeekdayHeatmapPoint(weekday=wd, type=t, count=c)
        for (wd, t), c in sorted(weekday_buckets.items())
    ]

    # --- intensity_histogram ---
    intensity_buckets: dict = defaultdict(int)
    for e in entries:
        if e.intensity is not None:
            intensity_buckets[(e.sport_type, e.intensity)] += 1
    intensity_histogram = [
        IntensityHistogramPoint(type=t, intensity=i, count=c)
        for (t, i), c in sorted(intensity_buckets.items())
    ]

    return SportStats(
        range=range,
        granularity=granularity,
        summary=summary,
        by_type=by_type,
        timeline=timeline,
        weekday_heatmap=weekday_heatmap,
        intensity_histogram=intensity_histogram,
    )


# --- Helpers ---

def _build_timeline(
    entries: list,
    start: Optional[date],
    today: date,
    granularity: Literal["daily", "monthly"],
) -> list[TimelinePoint]:
    """Zeitreihe bauen, Luecken mit Nullen auffuellen."""
    if granularity == "daily":
        buckets: dict = defaultdict(lambda: {"sessions": 0, "minutes": 0})
        for e in entries:
            key = e.date.isoformat()
            buckets[key]["sessions"] += 1
            if e.duration_min:
                buckets[key]["minutes"] += e.duration_min

        result: list[TimelinePoint] = []
        d = start if start else (min((e.date for e in entries), default=today))
        while d <= today:
            key = d.isoformat()
            result.append(TimelinePoint(
                period=key,
                sessions=buckets[key]["sessions"],
                minutes=buckets[key]["minutes"],
            ))
            d += timedelta(days=1)
        return result

    # monthly
    month_buckets: dict = defaultdict(lambda: {"sessions": 0, "minutes": 0})
    for e in entries:
        key = f"{e.date.year:04d}-{e.date.month:02d}"
        month_buckets[key]["sessions"] += 1
        if e.duration_min:
            month_buckets[key]["minutes"] += e.duration_min

    result = []
    if not entries and start is None:
        return result
    first = start if start else min(e.date for e in entries)
    year, month = first.year, first.month
    end_year, end_month = today.year, today.month
    while (year, month) <= (end_year, end_month):
        key = f"{year:04d}-{month:02d}"
        result.append(TimelinePoint(
            period=key,
            sessions=month_buckets[key]["sessions"],
            minutes=month_buckets[key]["minutes"],
        ))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return result
