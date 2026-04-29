# Journal Analytics API — Endpunkte für Mood, Clustering, Storylines
# Alle Endpunkte erfordern eine entsperrte Journal-Session
# Daten werden entschlüsselt, analysiert, Ergebnisse zurückgegeben
#
# WICHTIG: Entschlüsselte Daten leben nur im RAM während der Analyse
# Ergebnisse enthalten keine verschlüsselten Rohdaten
# WICHTIG: Soft-gelöschte Einträge (is_deleted=1) werden überall gefiltert
#
# Mood-Caching: Ergebnisse werden in mood_cache Tabelle gespeichert
# Storyline-Caching: Ergebnisse werden in storyline_cache gespeichert
# Nur neue/geänderte Einträge werden via Ollama analysiert

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.journal.api.dependencies import require_unlocked
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.services.mood_service import (
    analyze_entry_mood,
    analyze_multiple_entries,
)
from backend.journal.services.storyline_service import detect_storylines
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.journal_entry import JournalEntry

# Router — wird in main.py registriert
router = APIRouter(
    prefix="/api/journal/analytics",
    tags=["journal-analytics"],
    dependencies=[Depends(require_unlocked)],
)


def _decrypt_entry(entry: JournalEntry, key: bytes) -> dict:
    """Entschlüsselt einen Eintrag und gibt ihn als dict zurück."""
    return {
        "id": entry.id,
        "title": decrypt_text(entry.encrypted_title, key),
        "content": decrypt_text(entry.encrypted_content, key),
        "date": decrypt_text(entry.encrypted_date, key),
    }


# --- Mood Endpunkte (mit Cache) ---

@router.post("/mood/{entry_id}")
async def get_entry_mood(
    entry_id: int,
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """Analysiert die Stimmung eines einzelnen Eintrags (gecacht)."""
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id, JournalEntry.is_deleted == 0
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    key = session_manager.get_key()
    decrypted = _decrypt_entry(entry, key)
    return await analyze_entry_mood(
        entry_id=decrypted["id"],
        title=decrypted["title"],
        content=decrypted["content"],
        language=language,
        db=db,
    )


@router.post("/mood")
async def get_all_moods(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """
    Analysiert die Stimmung aller Einträge (gecacht).
    Nur neue/geänderte Einträge werden via Ollama analysiert.
    """
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()
    if not entries:
        return []

    key = session_manager.get_key()
    decrypted = [_decrypt_entry(e, key) for e in entries]
    return await analyze_multiple_entries(decrypted, language, db)


# --- Clustering Endpunkte ---

@router.post("/clusters")
async def get_clusters(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """Stub: Topics-System wird auf neue Embedding-Pipeline migriert (Phase 4).
    Neuer Endpoint kommt unter /api/journal/insights/topics."""
    raise HTTPException(
        status_code=503,
        detail="Topics-System wird migriert. Bitte CLI nutzen: "
               "python -m backend.scripts.journal_recluster",
    )


# --- Storyline Endpunkte (mit Cache) ---

@router.post("/storylines")
async def get_storylines(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """
    Erkennt narrative Bögen über mehrere Einträge.
    Nutzt DB-Cache — nur bei neuen/geänderten Einträgen wird Ollama gefragt.
    """
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).order_by(JournalEntry.created_at).all()
    if len(entries) < 3:
        raise HTTPException(
            status_code=400,
            detail="Mindestens 3 Einträge für Storyline-Erkennung nötig",
        )

    key = session_manager.get_key()
    decrypted = [_decrypt_entry(e, key) for e in entries]
    # DB-Session wird durchgereicht für Caching
    return await detect_storylines(decrypted, language, db=db)
