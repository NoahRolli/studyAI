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
from backend.journal.models.journal_entry import JournalEntry
from backend.journal.models.mood_cache import MoodCache
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.api.dependencies import require_unlocked
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


def _load_journal_moods(db: Session, aes_key: bytes, start: date, end: date) -> dict[date, list[float]]:
    # Lädt Journal-Entries + gecachte Mood-Scores, entschlüsselt pro Entry das Datum
    # Ergebnis: date -> Liste von Scores (mehrere Entries pro Tag möglich)
    # Scores aus mood_cache sind -1.0 bis +1.0 — werden auf 1.0-10.0 skaliert
    rows = (
        db.query(JournalEntry, MoodCache)
        .join(MoodCache, JournalEntry.id == MoodCache.entry_id)
        .filter(JournalEntry.is_deleted == 0)
        .all()
    )
    out: dict[date, list[float]] = {}
    for entry, cache in rows:
        try:
            date_str = decrypt_text(entry.encrypted_date, aes_key)
            d_ = date.fromisoformat(date_str)
        except (ValueError, TypeError, Exception):
            continue
        if d_ < start or d_ > end:
            continue
        # Skalierung von [-1, 1] auf [1, 10] — konsistent mit Check-In-Scores
        scaled = (cache.score + 1.0) * 4.5 + 1.0
        out.setdefault(d_, []).append(scaled)
    return out


@router.post("/sport-correlation")
def sport_correlation(
    days: int = Query(30, ge=7, le=365),
    pallas_db: Session = Depends(get_db),
    journal_db: Session = Depends(get_journal_db),
):
    # Endpoint: POST /api/insights/sport-correlation?days=30
    # Verlangt entsperrtes Journal — Journal-Entry-Daten werden decrypted
    # Zeitraum: heute - days bis heute, Mood/Body +1 Tag für Lag-Analyse
    require_unlocked()
    aes_key = session_manager.get_key()

    today = date.today()
    start = today - timedelta(days=days)
    end = today
    load_end = end + timedelta(days=1)

    sport_by_date = _load_sport(pallas_db, start, end)
    mood_ci, body_ci = _load_scores(journal_db, start, load_end)
    journal_mood = _load_journal_moods(journal_db, aes_key, start, load_end)

    # Beide Mood-Quellen kombinieren: Journal-Entries + Check-Ins pro Tag
    combined_mood: dict[date, float] = {}
    all_dates = set(mood_ci.keys()) | set(journal_mood.keys())
    for d_ in all_dates:
        scores: list[float] = []
        if d_ in mood_ci:
            scores.append(mood_ci[d_])
        if d_ in journal_mood:
            scores.extend(journal_mood[d_])
        if scores:
            combined_mood[d_] = sum(scores) / len(scores)

    # Body-Score nur aus Check-Ins — im Journal gibt es keinen Body-Score
    result = compute_correlation(
        sport_by_date=sport_by_date,
        mood_by_date=combined_mood,
        body_by_date=body_ci,
        start=start,
        end=end,
    )
    return result
