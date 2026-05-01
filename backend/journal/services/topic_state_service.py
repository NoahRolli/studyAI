# Topic State Service — Zugriff auf Singleton-State der Topics-Pipeline
#
# Lazy-Initialisierung: erste Abfrage erstellt Row mit id=1 falls fehlt.
# Alle Funktionen sind synchron und erwarten eine offene DB-Session.
#
# Konstanten:
# - RECOMPUTE_RECOMMENDED_THRESHOLD: ab wievielen neuen Entries der UI-Hinweis
#   erscheint. Aktuell 3 (proaktiv) — kann bei Bedarf erhoeht werden.

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.journal.models.journal_topic_state import JournalTopicState


# Schwelle ab der das Frontend einen Recompute empfiehlt
RECOMPUTE_RECOMMENDED_THRESHOLD = 3


def get_or_create_state(db: Session) -> JournalTopicState:
    """Liefert die Singleton-Row, erstellt sie bei Bedarf."""
    state = db.query(JournalTopicState).filter(JournalTopicState.id == 1).first()
    if state is None:
        state = JournalTopicState(
            id=1,
            entries_added_since_recompute=0,
            last_full_recompute_at=None,
        )
        db.add(state)
        db.flush()
    return state


def increment_counter(db: Session) -> int:
    """
    Inkrementiert den Counter um 1. Returns den neuen Wert.
    Aufgerufen von assign_entry_to_cluster() bei erfolgreicher Zuweisung.
    Commit ist Verantwortung des Callers (Cluster-Zuweisung commitet sowieso).
    """
    state = get_or_create_state(db)
    state.entries_added_since_recompute = (state.entries_added_since_recompute or 0) + 1
    return state.entries_added_since_recompute


def reset_after_recompute(db: Session) -> None:
    """
    Setzt Counter auf 0 und last_full_recompute_at auf jetzt.
    Aufgerufen von cluster_all_entries() am Ende.
    Commit ist Verantwortung des Callers.
    """
    state = get_or_create_state(db)
    state.entries_added_since_recompute = 0
    state.last_full_recompute_at = datetime.now(timezone.utc)


def get_state_summary(db: Session) -> dict:
    """
    Liefert ein Dict fuer die API-Response.
    Inkludiert das Recompute-Empfehlungs-Flag basierend auf Threshold.
    """
    state = get_or_create_state(db)
    count = state.entries_added_since_recompute or 0
    return {
        "entries_since_last_recompute": count,
        "last_recompute_at": (
            state.last_full_recompute_at.isoformat()
            if state.last_full_recompute_at
            else None
        ),
        "recompute_recommended": count >= RECOMPUTE_RECOMMENDED_THRESHOLD,
        "recompute_threshold": RECOMPUTE_RECOMMENDED_THRESHOLD,
    }
