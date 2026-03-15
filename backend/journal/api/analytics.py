# Journal Analytics API — Endpunkte für Mood, Clustering, Storylines
# Alle Endpunkte erfordern eine entsperrte Journal-Session
# Daten werden entschlüsselt, analysiert, Ergebnisse zurückgegeben
#
# WICHTIG: Entschlüsselte Daten leben nur im RAM während der Analyse
# Ergebnisse enthalten keine verschlüsselten Rohdaten

from fastapi import APIRouter, Depends, HTTPException
from backend.journal.api.dependencies import require_unlocked
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.services.mood_service import (
    analyze_entry_mood,
    analyze_multiple_entries,
)
from backend.journal.services.embedding_service import generate_entry_embedding
from backend.journal.services.clustering_service import cluster_entries, label_cluster
from backend.journal.services.storyline_service import detect_storylines
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.journal_entry import JournalEntry
from sqlalchemy.orm import Session

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


# --- Mood Endpunkte ---

@router.post("/mood/{entry_id}")
async def get_entry_mood(
    entry_id: int,
    db: Session = Depends(get_journal_db),
):
    """Analysiert die Stimmung eines einzelnen Eintrags."""
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    key = session_manager.get_key()
    decrypted = _decrypt_entry(entry, key)

    return await analyze_entry_mood(
        entry_id=decrypted["id"],
        title=decrypted["title"],
        content=decrypted["content"],
    )


@router.post("/mood")
async def get_all_moods(
    db: Session = Depends(get_journal_db),
):
    """Analysiert die Stimmung aller Einträge. Für Zeitraum-Übersichten."""
    entries = db.query(JournalEntry).all()
    if not entries:
        return []

    key = session_manager.get_key()
    decrypted = [_decrypt_entry(e, key) for e in entries]

    return await analyze_multiple_entries(decrypted)


# --- Clustering Endpunkte ---

@router.post("/clusters")
async def get_clusters(
    db: Session = Depends(get_journal_db),
):
    """Gruppiert alle Einträge nach thematischer Ähnlichkeit."""
    entries = db.query(JournalEntry).all()
    if len(entries) < 2:
        raise HTTPException(
            status_code=400,
            detail="Mindestens 2 Einträge für Clustering nötig",
        )

    key = session_manager.get_key()

    # Einträge entschlüsseln und Embeddings generieren
    entries_with_embeddings = []
    for entry in entries:
        decrypted = _decrypt_entry(entry, key)
        embedding = await generate_entry_embedding(
            decrypted["title"], decrypted["content"]
        )
        entries_with_embeddings.append({**decrypted, "embedding": embedding})

    # Clustering durchführen
    clusters = cluster_entries(entries_with_embeddings)

    # Labels für jeden Cluster via AI generieren
    for c in clusters:
        c["label"] = await label_cluster(c["titles"])

    return clusters


# --- Storyline Endpunkte ---

@router.post("/storylines")
async def get_storylines(
    db: Session = Depends(get_journal_db),
):
    """Erkennt narrative Bögen über mehrere Einträge."""
    entries = db.query(JournalEntry).order_by(JournalEntry.created_at).all()
    if len(entries) < 3:
        raise HTTPException(
            status_code=400,
            detail="Mindestens 3 Einträge für Storyline-Erkennung nötig",
        )

    key = session_manager.get_key()
    decrypted = [_decrypt_entry(e, key) for e in entries]

    return await detect_storylines(decrypted)