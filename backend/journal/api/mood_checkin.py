# Mood Check-In API — Stimmungserfassung unabhaengig vom Journal
# POST: neuer Check-In, GET: nach Datum/Zeitraum, GET aggregiert
# Tageswert: Durchschnitt Check-Ins + Journal-Mood (falls vorhanden)

import json
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.mood_checkin import (
    MoodCheckIn, calculate_mood_score, calculate_body_score,
    MOOD_WEIGHTS, BODY_WEIGHTS,
)
from backend.journal.models.mood_cache import MoodCache
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.api.dependencies import require_unlocked

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/journal/mood-checkins", tags=["mood-checkins"])


class CheckInRequest(BaseModel):
    moods: list[str]
    body_moods: list[str] | None = None
    note: str | None = None


class DayMood(BaseModel):
    date: str
    checkin_scores: list[float]
    journal_score: float | None
    combined_score: float
    checkin_count: int


def _checkin_to_dict(c: MoodCheckIn) -> dict:
    """Einheitliche Serialisierung eines Check-Ins."""
    result = {
        "id": c.id, "timestamp": c.timestamp.isoformat(),
        "moods": json.loads(c.moods), "score": c.score,
        "note": c.note,
    }
    result["body_moods"] = json.loads(c.body_moods) if c.body_moods else []
    result["body_score"] = c.body_score
    return result


@router.get("/categories")
async def get_categories():
    """Verfuegbare Mood- und Body-Kategorien mit Gewichtung."""
    positive = {k: v for k, v in MOOD_WEIGHTS.items() if v > 0}
    negative = {k: v for k, v in MOOD_WEIGHTS.items() if v < 0}
    body_pos = {k: v for k, v in BODY_WEIGHTS.items() if v > 0}
    body_neg = {k: v for k, v in BODY_WEIGHTS.items() if v < 0}
    return {
        "positive": positive, "negative": negative,
        "body_positive": body_pos, "body_negative": body_neg,
    }


@router.post("")
async def create_checkin(
    req: CheckInRequest,
    db: Session = Depends(get_journal_db),
):
    """Neuen Mood Check-In erstellen."""
    valid_moods = [m for m in req.moods if m in MOOD_WEIGHTS]
    valid_body = [m for m in (req.body_moods or []) if m in BODY_WEIGHTS]

    # Mindestens Moods oder Body-Moods muessen vorhanden sein
    if not valid_moods and not valid_body:
        return {"error": "Keine gueltigen Moods ausgewaehlt"}

    now = datetime.now(ZoneInfo("Europe/Zurich"))
    score = calculate_mood_score(valid_moods)
    body_score = calculate_body_score(valid_body) if valid_body else None

    checkin = MoodCheckIn(
        timestamp=now,
        date=now.strftime("%Y-%m-%d"),
        moods=json.dumps(valid_moods),
        score=score,
        body_moods=json.dumps(valid_body) if valid_body else None,
        body_score=body_score,
        note=req.note,
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return _checkin_to_dict(checkin)


@router.get("/today")
async def get_today_checkins(db: Session = Depends(get_journal_db)):
    """Alle Check-Ins von heute."""
    today = datetime.now(ZoneInfo("Europe/Zurich")).strftime("%Y-%m-%d")
    checkins = db.query(MoodCheckIn).filter(
        MoodCheckIn.date == today
    ).order_by(MoodCheckIn.timestamp).all()
    return [_checkin_to_dict(c) for c in checkins]


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
    since = (datetime.now(ZoneInfo("Europe/Zurich")) - timedelta(days=days)).strftime("%Y-%m-%d")

    # Check-Ins nach Datum gruppieren
    checkins = db.query(MoodCheckIn).filter(
        MoodCheckIn.date >= since
    ).all()
    checkin_by_date: dict[str, list[float]] = {}
    for c in checkins:
        if c.date not in checkin_by_date:
            checkin_by_date[c.date] = []
        checkin_by_date[c.date].append(c.score)

    # Journal-Mood-Scores — Datum entschluesseln, Score normalisieren
    journal_scores: dict[str, float] = {}
    key = session_manager.get_key()
    if key:
        from backend.journal.models.journal_entry import JournalEntry
        mood_caches = db.query(MoodCache).all()
        for mc in mood_caches:
            entry = db.query(JournalEntry).filter(
                JournalEntry.id == mc.entry_id
            ).first()
            if not entry:
                continue
            try:
                date_str = decrypt_text(entry.encrypted_date, key)
            except Exception:
                continue
            if date_str < since:
                continue
            # Normalisiere -1..1 auf 1..10 Skala
            normalized = round((mc.score + 1) * 4.5 + 1, 1)
            journal_scores[date_str] = max(1.0, min(10.0, normalized))

    # Zusammenfuehren
    all_dates = sorted(set(list(checkin_by_date.keys()) + list(journal_scores.keys())))
    result: list[dict] = []
    for date in all_dates:
        ci_scores = checkin_by_date.get(date, [])
        j_score = journal_scores.get(date)
        all_scores = list(ci_scores)
        if j_score is not None:
            all_scores.append(j_score)
        combined = round(sum(all_scores) / len(all_scores), 1) if all_scores else 5.0
        result.append({
            "date": date, "checkin_scores": ci_scores,
            "journal_score": j_score, "combined_score": combined,
            "checkin_count": len(ci_scores),
        })
    return result


@router.get("/by-date/{date}")
async def get_checkins_by_date(
    date: str,
    db: Session = Depends(get_journal_db),
):
    """Alle Check-Ins fuer ein bestimmtes Datum."""
    checkins = db.query(MoodCheckIn).filter(
        MoodCheckIn.date == date
    ).order_by(MoodCheckIn.timestamp).all()
    return [_checkin_to_dict(c) for c in checkins]


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
