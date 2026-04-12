# Medikamenten-Kalender + Pending-Today Endpunkte
# Ausgelagert aus medications.py um 250Z-Limit einzuhalten

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.medication import (
    Medication, IntakeLog, MedicationSettings,
)
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import decrypt_text
from backend.journal.api.dependencies import require_unlocked
from backend.journal.api.medications import _decrypt_medication

router = APIRouter(
    prefix="/api/journal/medications",
    tags=["journal-medications"],
)


@router.get("/intake/calendar/{month}")
def get_intake_calendar(month: str, db: Session = Depends(get_journal_db)):
    """Einnahme-Logs aller Medikamente für einen Monat."""
    require_unlocked()
    key = session_manager.get_key()
    meds = db.query(Medication).filter(Medication.is_deleted == 0).all()
    med_names = {}
    for med in meds:
        try:
            med_names[med.id] = decrypt_text(med.encrypted_name, key)
        except Exception:
            continue
    result = []
    for mid in med_names:
        for log in db.query(IntakeLog).filter(IntakeLog.medication_id == mid).all():
            try:
                date_str = decrypt_text(log.encrypted_date, key)
                if not date_str.startswith(month):
                    continue
                result.append({
                    "medication_id": mid, "med_name": med_names[mid],
                    "date": date_str,
                    "status": decrypt_text(log.encrypted_status, key),
                    "notes": (decrypt_text(log.encrypted_notes, key)
                              if log.encrypted_notes else None),
                })
            except Exception:
                continue
    return result


@router.get("/pending-today")
def get_pending_today(db: Session = Depends(get_journal_db)):
    """Heute noch nicht als 'taken' bestätigte Medikamente."""
    require_unlocked()
    settings = db.query(MedicationSettings).first()
    if not settings or not settings.is_enabled:
        return []
    key = session_manager.get_key()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    meds = db.query(Medication).filter(Medication.is_deleted == 0).all()
    pending = []
    for med in meds:
        try:
            med_data = _decrypt_medication(med, key)
        except Exception:
            continue
        taken_today = False
        for log in db.query(IntakeLog).filter(IntakeLog.medication_id == med.id).all():
            try:
                if decrypt_text(log.encrypted_date, key) == today:
                    if decrypt_text(log.encrypted_status, key) == "taken":
                        taken_today = True
                        break
            except Exception:
                continue
        if not taken_today:
            pending.append({"id": med_data["id"], "name": med_data["name"],
                            "dosage": med_data["dosage"]})
    return pending
