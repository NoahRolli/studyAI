# Sport-Correlation API-Endpoint
# POST /api/insights/sport-correlation?days=30
# Liest Sport aus pallas.db, Mood-Checkins aus journal.db (beide via Depends)
# Aggregiert pro Tag, ruft sport_correlation_service auf
# Kein Unlock nötig — mood_checkins.date + score sind Plaintext

from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.sport_entry import SportEntry
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.mood_checkin import MoodCheckIn
from backend.services.sport_correlation_service import compute_correlation

router = APIRouter(prefix="/api/insights", tags=["insights"])


def _load_sport(db: Session, start: date, end: date) -> dict[date, int]:
    # Pro Tag maximale Intensität (falls mehrere Trainings am selben Tag)
    rows = (
        db.query(SportEntry)
        .filter(SportEntry.date >= start, SportEntry.date <= end)
        .all()
    )
    out: dict[date, int] = {}
    for r in rows:
        intensity = r.intensity if r.intensity is not None else 3
        prev = out.get(r.date)
        if prev is None or intensity > prev:
            out[r.date] = intensity
    return out


def _load_scores(db: Session, start: date, end: date) -> tuple[dict[date, float], dict[date, float]]:
    # Tagesdurchschnitt für Mood und Body aus allen Check-Ins des Tages
    # mood_checkins.date ist String YYYY-MM-DD — String-Vergleich funktioniert hier lexikographisch korrekt
    start_str = start.isoformat()
    end_str = end.isoformat()
    rows = (
        db.query(MoodCheckIn)
        .filter(MoodCheckIn.date >= start_str, MoodCheckIn.date <= end_str)
        .all()
    )
    mood_acc: dict[date, list[float]] = {}
    body_acc: dict[date, list[float]] = {}
    for r in rows:
        try:
            d_ = date.fromisoformat(r.date)
        except (ValueError, TypeError):
            continue
        mood_acc.setdefault(d_, []).append(r.score)
        if r.body_score is not None:
            body_acc.setdefault(d_, []).append(r.body_score)
    mood_by_date = {d_: sum(v) / len(v) for d_, v in mood_acc.items()}
    body_by_date = {d_: sum(v) / len(v) for d_, v in body_acc.items()}
    return mood_by_date, body_by_date


@router.post("/sport-correlation")
def sport_correlation(
    days: int = Query(30, ge=7, le=365),
    pallas_db: Session = Depends(get_db),
    journal_db: Session = Depends(get_journal_db),
):
    # Endpoint: POST /api/insights/sport-correlation?days=30
    # Zeitraum: heute - days bis heute
    # Mood/Body wird bis end+1 geladen für Lag-Analyse (Tag nach Sport)
    today = date.today()
    start = today - timedelta(days=days)
    end = today

    sport_by_date = _load_sport(pallas_db, start, end)
    mood_by_date, body_by_date = _load_scores(journal_db, start, end + timedelta(days=1))
    result = compute_correlation(
        sport_by_date=sport_by_date,
        mood_by_date=mood_by_date,
        body_by_date=body_by_date,
        start=start,
        end=end,
    )
    return result
