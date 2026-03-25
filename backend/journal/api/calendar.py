# Kalender-API — Liefert Einträge gruppiert nach Datum
# Für die Kalender-Ansicht im Frontend
# WICHTIG: Kein Content wird zurückgegeben (Sicherheit!)
# Nur id, title, date + optional mood_score für Glow-Darstellung

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.journal_entry import JournalEntry
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.api.dependencies import require_unlocked

# Router — wird in main.py registriert
router = APIRouter(
    prefix="/api/journal/calendar",
    tags=["journal-calendar"],
    dependencies=[Depends(require_unlocked)],
)


@router.get("/")
def get_calendar_entries(
    month: str = Query(..., description="Format: YYYY-MM, z.B. 2026-03"),
    db: Session = Depends(get_journal_db),
):
    """Kalender-Daten für einen Monat.

    Gibt pro Eintrag nur id, title und date zurück.
    Kein Content — der bleibt verschlüsselt bis man
    explizit einen Eintrag öffnet.
    """
    # Alle nicht-gelöschten Einträge laden
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()

    aes_key = session_manager.get_key()
    result = []

    for entry in entries:
        try:
            # Datum entschlüsseln um Monatsfilter anzuwenden
            date_str = decrypt_text(entry.encrypted_date, aes_key)

            # Nur Einträge aus dem angefragten Monat
            if not date_str.startswith(month):
                continue

            # Titel entschlüsseln (für Tooltip im Kalender)
            title = decrypt_text(entry.encrypted_title, aes_key)

            result.append({
                "id": entry.id,
                "title": title,
                "date": date_str,
            })
        except Exception:
            # Entschlüsselung fehlgeschlagen — überspringen
            continue

    return result