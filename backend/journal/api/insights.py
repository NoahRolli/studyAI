# Insights API — Journal-Datenanalyse Endpunkte
# Kombiniert Mood, Medikamente, Einträge für Mustererkennung
# Alle Daten werden entschlüsselt, analysiert, Ergebnisse zurückgegeben
#
# WICHTIG: Entschlüsselte Daten leben nur im RAM
# Ergebnisse enthalten keine verschlüsselten Rohdaten
# Ollama-only für AI-Summary

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.journal.api.dependencies import require_unlocked
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.services.mood_service import analyze_multiple_entries
from backend.journal.services.journal_ai_service import journal_ai
from backend.journal.services.insights_service import (
    analyze_medication_mood,
    analyze_weekday_mood,
    analyze_writing_patterns,
    analyze_keyword_mood,
)
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.journal_entry import JournalEntry
from backend.journal.models.medication import (
    Medication,
    IntakeLog,
    MedicationSettings,
)

# Router — wird in main.py registriert
router = APIRouter(
    prefix="/api/journal/insights",
    tags=["journal-insights"],
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


async def _get_moods_with_dates(
    entries: list[dict], language: str, db: Session
) -> list[dict]:
    """Holt Mood-Scores und fügt das Datum aus den Entries hinzu."""
    moods = await analyze_multiple_entries(entries, language, db)
    # Datum aus den Entries an die Mood-Dicts anhängen
    entry_by_id = {e["id"]: e for e in entries}
    for m in moods:
        entry = entry_by_id.get(m["entry_id"])
        if entry:
            m["date"] = entry["date"]
    return moods


def _get_all_intake_logs(db: Session, key: bytes) -> list[dict]:
    """Alle Einnahme-Logs entschlüsseln mit Medikamenten-Namen."""
    meds = db.query(Medication).filter(Medication.is_deleted == 0).all()
    med_names: dict[int, str] = {}
    for med in meds:
        try:
            med_names[med.id] = decrypt_text(med.encrypted_name, key)
        except Exception:
            continue

    logs = db.query(IntakeLog).all()
    result = []
    for log in logs:
        try:
            result.append({
                "medication_id": log.medication_id,
                "med_name": med_names.get(log.medication_id, "?"),
                "date": decrypt_text(log.encrypted_date, key),
                "status": decrypt_text(log.encrypted_status, key),
            })
        except Exception:
            continue
    return result


# --- Einzelne Insight-Endpunkte ---

@router.post("/medication-mood")
async def get_medication_mood(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """Korrelation Medikament ↔ Stimmung."""
    key = session_manager.get_key()
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()
    if len(entries) < 3:
        raise HTTPException(400, "Mindestens 3 Einträge nötig")

    decrypted = [_decrypt_entry(e, key) for e in entries]
    moods = await _get_moods_with_dates(decrypted, language, db)
    intake_logs = _get_all_intake_logs(db, key)
    return analyze_medication_mood(moods, intake_logs)


@router.post("/weekday-mood")
async def get_weekday_mood(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """Stimmung nach Wochentag."""
    key = session_manager.get_key()
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()
    if len(entries) < 3:
        raise HTTPException(400, "Mindestens 3 Einträge nötig")

    decrypted = [_decrypt_entry(e, key) for e in entries]
    moods = await _get_moods_with_dates(decrypted, language, db)
    return analyze_weekday_mood(moods)


@router.post("/writing-patterns")
async def get_writing_patterns(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """Schreib-Muster Analyse."""
    key = session_manager.get_key()
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()
    if not entries:
        raise HTTPException(400, "Keine Einträge vorhanden")

    decrypted = [_decrypt_entry(e, key) for e in entries]
    moods = await _get_moods_with_dates(decrypted, language, db)
    return analyze_writing_patterns(decrypted, moods)


@router.post("/keyword-mood")
async def get_keyword_mood(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """Themen ↔ Stimmung Korrelation."""
    key = session_manager.get_key()
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).all()
    if len(entries) < 3:
        raise HTTPException(400, "Mindestens 3 Einträge nötig")

    decrypted = [_decrypt_entry(e, key) for e in entries]
    moods = await _get_moods_with_dates(decrypted, language, db)
    return analyze_keyword_mood(moods)


@router.post("/ai-summary")
async def get_ai_summary(
    language: str = Query(default="de"),
    db: Session = Depends(get_journal_db),
):
    """AI-generierte Zusammenfassung aller Muster (Ollama-only)."""
    key = session_manager.get_key()
    entries = db.query(JournalEntry).filter(
        JournalEntry.is_deleted == 0
    ).order_by(JournalEntry.created_at).all()
    if len(entries) < 3:
        raise HTTPException(400, "Mindestens 3 Einträge nötig")

    decrypted = [_decrypt_entry(e, key) for e in entries]
    moods = await _get_moods_with_dates(decrypted, language, db)
    intake_logs = _get_all_intake_logs(db, key)

    # Alle Analysen sammeln
    med_mood = analyze_medication_mood(moods, intake_logs)
    weekday = analyze_weekday_mood(moods)
    writing = analyze_writing_patterns(decrypted, moods)
    keywords = analyze_keyword_mood(moods)

    # Prompt für Ollama zusammenbauen
    prompt = _build_summary_prompt(
        med_mood, weekday, writing, keywords, language
    )
    try:
        result = await journal_ai._chat(prompt=prompt, max_tokens=1500)
        return {"summary": result}
    except Exception:
        return {"summary": None, "error": "Ollama nicht erreichbar"}


def _build_summary_prompt(
    med_mood: list, weekday: list, writing: dict,
    keywords: list, language: str,
) -> str:
    """Baut den AI-Summary Prompt aus allen Analyse-Ergebnissen."""
    if language == "de":
        return f"""Du bist ein einfühlsamer Journal-Analyst.
Fasse die folgenden Muster in 3-5 kurzen, hilfreichen Sätzen zusammen.
Sei unterstützend und konstruktiv. Keine medizinischen Ratschläge.

Medikament-Stimmung: {med_mood}
Wochentag-Stimmung: {weekday}
Schreib-Muster: {writing}
Themen-Stimmung (Top 10): {keywords[:10]}

Antworte auf Deutsch in Fliesstext, keine Listen."""

    return f"""You are an empathetic journal analyst.
Summarize the following patterns in 3-5 short, helpful sentences.
Be supportive and constructive. No medical advice.

Medication-Mood: {med_mood}
Weekday-Mood: {weekday}
Writing Patterns: {writing}
Keyword-Mood (Top 10): {keywords[:10]}

Respond in flowing text, no lists."""