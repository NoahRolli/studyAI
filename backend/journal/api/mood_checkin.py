# Mood Check-In API — Stimmungserfassung unabhaengig vom Journal
# POST: neuer Check-In, GET: nach Datum/Zeitraum, GET aggregiert
# Tageswert: Durchschnitt Check-Ins + Journal-Mood (falls vorhanden)

import json
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.mood_checkin import (
    MoodCheckIn, calculate_mood_score, MOOD_WEIGHTS,
)
from backend.journal.models.mood_cache import MoodCache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/journal/mood-checkins", tags=["mood-checkins"])


class CheckInRequest(BaseModel):
    moods: list[str]
    note: str | None = None


class DayMood(BaseModel):
    date: str
    checkin_scores: list[float]
    journal_score: float | None
    combined_score: float
    checkin_count: int


@router.get("/categories")
async def get_categories():
    """Verfuegbare Mood-Kategorien mit Gewichtung."""
    positive = {k: v for k, v in MOOD_WEIGHTS.items() if v > 0}
    negative = {k: v for k, v in MOOD_WEIGHTS.items() if v < 0}
    return {"positive": positive, "negative": negative}


@router.post("")
async def create_checkin(
    req: CheckInRequest,
    db: Session = Depends(get_journal_db),
):
    """Neuen Mood Check-In erstellen."""
    # Nur gueltige Moods akzeptieren
    valid_moods = [m for m in req.moods if m in MOOD_WEIGHTS]
    if not valid_moods:
        return {"error": "Keine gueltigen Moods ausgewaehlt"}

    now = datetime.now(timezone.utc)
    score = calculate_mood_score(valid_moods)

    checkin = MoodCheckIn(
        timestamp=now,
        date=now.strftime("%Y-%m-%d"),
        moods=json.dumps(valid_moods),
        score=score,
        note=req.note,
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)

    return {
        "id": checkin.id,
        "timestamp": checkin.timestamp.isoformat(),
        "date": checkin.date,
        "moods": valid_moods,
        "score": score,
        "note": checkin.note,
    }


@router.get("/today")
async def get_today_checkins(db: Session = Depends(get_journal_db)):
    """Alle Check-Ins von heute."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    checkins = db.query(MoodCheckIn).filter(
        MoodCheckIn.date == today
    ).order_by(MoodCheckIn.timestamp).all()

    return [
        {
            "id": c.id, "timestamp": c.timestamp.isoformat(),
            "moods": json.loads(c.moods), "score": c.score,
            "note": c.note,
        }
        for c in checkins
    ]


@router.get("/last-checkin")
async def get_last_checkin(db: Session = Depends(get_journal_db)):
    """Letzter Check-In (fuer Cooldown-Berechnung)."""
    last = db.query(MoodCheckIn).order_by(
        MoodCheckIn.timestamp.desc()
    ).first()
    if not last:
        return {"last": None}
    return {"last": last.timestamp.isoformat()}


@router.get("/aggregated")
async def get_aggregated_moods(
    days: int = 30,
    db: Session = Depends(get_journal_db),
):
    """Tageswerte: Durchschnitt Check-Ins + Journal-Mood kombiniert."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    # Check-Ins nach Datum gruppieren
    checkins = db.query(MoodCheckIn).filter(
        MoodCheckIn.date >= since
    ).all()

    checkin_by_date: dict[str, list[float]] = {}
    for c in checkins:
        if c.date not in checkin_by_date:
            checkin_by_date[c.date] = []
        checkin_by_date[c.date].append(c.score)

    # Journal-Mood-Scores nach Datum
    mood_caches = db.query(MoodCache).all()
    # MoodCache hat entry_id, brauchen Datum vom Entry
    from backend.journal.models.journal_entry import JournalEntry
    journal_scores: dict[str, float] = {}
    for mc in mood_caches:
        entry = db.query(JournalEntry).filter(
            JournalEntry.id == mc.entry_id
        ).first()
        if entry and entry.date >= since:
            journal_scores[entry.date] = mc.score

    # Alle Daten zusammenfuehren
    all_dates = sorted(set(list(checkin_by_date.keys()) + list(journal_scores.keys())))
    result: list[dict] = []

    for date in all_dates:
        ci_scores = checkin_by_date.get(date, [])
        j_score = journal_scores.get(date)

        # Kombinierter Score: alle Werte mitteln
        all_scores = list(ci_scores)
        if j_score is not None:
            all_scores.append(j_score)

        combined = round(sum(all_scores) / len(all_scores), 1) if all_scores else 5.0

        result.append({
            "date": date,
            "checkin_scores": ci_scores,
            "journal_score": j_score,
            "combined_score": combined,
            "checkin_count": len(ci_scores),
        })

    return result


@router.delete("/{checkin_id}")
async def delete_checkin(
    checkin_id: int,
    db: Session = Depends(get_journal_db),
):
    """Check-In loeschen."""
    checkin = db.query(MoodCheckIn).filter(MoodCheckIn.id == checkin_id).first()
    if not checkin:
        return {"error": "Nicht gefunden"}
    db.delete(checkin)
    db.commit()
    return {"deleted": checkin_id}
