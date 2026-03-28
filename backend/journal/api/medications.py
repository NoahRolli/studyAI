# API-Endpunkte für den Medikamenten-Tracker
# Alle Daten werden vor dem Speichern verschlüsselt und beim Lesen entschlüsselt
# Gleiche Verschlüsselungslogik wie bei Journal-Entries (AES-256-GCM)
#
# Endpunkte:
# - GET/POST/PUT/DELETE für Medikamente
# - POST/GET/DELETE für Einnahme-Logs
# - GET/POST für Tracker-Aktivierung (Settings)
# - GET für heute offene Medikamente (Erinnerung)

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.medication import (
    Medication,
    IntakeLog,
    MedicationSettings,
)
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import encrypt_text, decrypt_text
from backend.journal.api.dependencies import require_unlocked
from backend.journal.api.medication_schemas import (
    MedicationCreate,
    MedicationUpdate,
    IntakeLogCreate,
)

# Router — wird in main.py registriert
router = APIRouter(
    prefix="/api/journal/medications",
    tags=["journal-medications"],
)


# ============================================
# Hilfsfunktionen
# ============================================

def _decrypt_medication(med: Medication, key: bytes) -> dict:
    """Entschlüsselt ein Medikament und gibt es als dict zurück."""
    return {
        "id": med.id,
        "name": decrypt_text(med.encrypted_name, key),
        "dosage": decrypt_text(med.encrypted_dosage, key),
        "frequency": decrypt_text(med.encrypted_frequency, key),
        "start_date": decrypt_text(med.encrypted_start_date, key),
        "end_date": (
            decrypt_text(med.encrypted_end_date, key)
            if med.encrypted_end_date else None
        ),
        "notes": (
            decrypt_text(med.encrypted_notes, key)
            if med.encrypted_notes else None
        ),
        "created_at": med.created_at.isoformat(),
        "updated_at": med.updated_at.isoformat(),
    }


def _decrypt_intake(log: IntakeLog, key: bytes) -> dict:
    """Entschlüsselt einen Einnahme-Eintrag."""
    return {
        "id": log.id,
        "medication_id": log.medication_id,
        "date": decrypt_text(log.encrypted_date, key),
        "status": decrypt_text(log.encrypted_status, key),
        "created_at": log.created_at.isoformat(),
    }


# ============================================
# Settings — Tracker aktivieren/deaktivieren
# ============================================

@router.get("/settings")
def get_settings(db: Session = Depends(get_journal_db)):
    """Gibt zurück ob der Medikamenten-Tracker aktiviert ist."""
    require_unlocked()
    settings = db.query(MedicationSettings).first()
    if not settings:
        return {"is_enabled": False}
    return {"is_enabled": bool(settings.is_enabled)}


@router.post("/settings/toggle")
def toggle_tracker(db: Session = Depends(get_journal_db)):
    """Schaltet den Tracker an oder aus."""
    require_unlocked()
    settings = db.query(MedicationSettings).first()
    if not settings:
        settings = MedicationSettings(id=1, is_enabled=1)
        db.add(settings)
    else:
        settings.is_enabled = 0 if settings.is_enabled else 1
    db.commit()
    return {"is_enabled": bool(settings.is_enabled)}


# ============================================
# Medikamente CRUD
# ============================================

@router.get("/")
def get_medications(db: Session = Depends(get_journal_db)):
    """Alle aktiven Medikamente abrufen (entschlüsselt)."""
    require_unlocked()
    meds = db.query(Medication).filter(Medication.is_deleted == 0).all()
    key = session_manager.get_key()
    result = []
    for med in meds:
        try:
            result.append(_decrypt_medication(med, key))
        except Exception:
            continue
    return result


@router.post("/")
def create_medication(
    data: MedicationCreate,
    db: Session = Depends(get_journal_db),
):
    """Neues Medikament anlegen (verschlüsselt)."""
    require_unlocked()
    key = session_manager.get_key()

    med = Medication(
        encrypted_name=encrypt_text(data.name, key),
        encrypted_dosage=encrypt_text(data.dosage, key),
        encrypted_frequency=encrypt_text(data.frequency, key),
        encrypted_start_date=encrypt_text(data.start_date, key),
        encrypted_end_date=(
            encrypt_text(data.end_date, key) if data.end_date else None
        ),
        encrypted_notes=(
            encrypt_text(data.notes, key) if data.notes else None
        ),
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return {"id": med.id, "message": "Medikament erstellt und verschlüsselt."}


@router.put("/{med_id}")
def update_medication(
    med_id: int,
    data: MedicationUpdate,
    db: Session = Depends(get_journal_db),
):
    """Medikament aktualisieren (neu verschlüsselt)."""
    require_unlocked()
    med = db.query(Medication).filter(
        Medication.id == med_id, Medication.is_deleted == 0
    ).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medikament nicht gefunden.")

    key = session_manager.get_key()
    current = _decrypt_medication(med, key)

    med.encrypted_name = encrypt_text(
        data.name if data.name is not None else current["name"], key
    )
    med.encrypted_dosage = encrypt_text(
        data.dosage if data.dosage is not None else current["dosage"], key
    )
    med.encrypted_frequency = encrypt_text(
        data.frequency if data.frequency is not None else current["frequency"], key
    )
    med.encrypted_start_date = encrypt_text(
        data.start_date if data.start_date is not None else current["start_date"], key
    )
    new_end = data.end_date if data.end_date is not None else current["end_date"]
    med.encrypted_end_date = encrypt_text(new_end, key) if new_end else None

    new_notes = data.notes if data.notes is not None else current["notes"]
    med.encrypted_notes = encrypt_text(new_notes, key) if new_notes else None

    db.commit()
    db.refresh(med)
    return {"id": med.id, "message": "Medikament aktualisiert."}


@router.delete("/{med_id}")
def delete_medication(med_id: int, db: Session = Depends(get_journal_db)):
    """Soft-Delete eines Medikaments."""
    require_unlocked()
    med = db.query(Medication).filter(
        Medication.id == med_id, Medication.is_deleted == 0
    ).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medikament nicht gefunden.")
    med.is_deleted = 1
    db.commit()
    return {"message": "Medikament gelöscht."}


# ============================================
# Einnahme-Log
# ============================================

@router.post("/intake")
def log_intake(
    data: IntakeLogCreate,
    db: Session = Depends(get_journal_db),
):
    """Einnahme protokollieren (genommen/übersprungen)."""
    require_unlocked()

    med = db.query(Medication).filter(
        Medication.id == data.medication_id, Medication.is_deleted == 0
    ).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medikament nicht gefunden.")

    key = session_manager.get_key()

    # Prüfen ob für dieses Datum schon ein Eintrag existiert
    existing_logs = db.query(IntakeLog).filter(
        IntakeLog.medication_id == data.medication_id
    ).all()
    for log in existing_logs:
        try:
            log_date = decrypt_text(log.encrypted_date, key)
            if log_date == data.date:
                log.encrypted_status = encrypt_text(data.status, key)
                db.commit()
                return {"id": log.id, "message": "Einnahme aktualisiert."}
        except Exception:
            continue

    log = IntakeLog(
        medication_id=data.medication_id,
        encrypted_date=encrypt_text(data.date, key),
        encrypted_status=encrypt_text(data.status, key),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "message": "Einnahme protokolliert."}


@router.get("/intake/{med_id}")
def get_intake_logs(
    med_id: int,
    db: Session = Depends(get_journal_db),
):
    """Alle Einnahme-Logs eines Medikaments abrufen (entschlüsselt)."""
    require_unlocked()
    logs = db.query(IntakeLog).filter(IntakeLog.medication_id == med_id).all()
    key = session_manager.get_key()
    result = []
    for log in logs:
        try:
            result.append(_decrypt_intake(log, key))
        except Exception:
            continue
    return result


# ============================================
# Kalender-Ansicht — Einnahmen pro Monat
# ============================================

@router.get("/intake/calendar/{month}")
def get_intake_calendar(
    month: str,
    db: Session = Depends(get_journal_db),
):
    """Alle Einnahme-Logs aller Medikamente für einen Monat."""
    require_unlocked()
    key = session_manager.get_key()

    meds = db.query(Medication).filter(Medication.is_deleted == 0).all()
    med_names: dict[int, str] = {}
    for med in meds:
        try:
            med_names[med.id] = decrypt_text(med.encrypted_name, key)
        except Exception:
            continue

    result = []
    for med_id in med_names:
        logs = db.query(IntakeLog).filter(
            IntakeLog.medication_id == med_id
        ).all()
        for log in logs:
            try:
                date_str = decrypt_text(log.encrypted_date, key)
                if not date_str.startswith(month):
                    continue
                status = decrypt_text(log.encrypted_status, key)
                result.append({
                    "medication_id": med_id,
                    "med_name": med_names[med_id],
                    "date": date_str,
                    "status": status,
                })
            except Exception:
                continue

    return result


# ============================================
# Erinnerung — Heute offene Medikamente
# ============================================

@router.get("/pending-today")
def get_pending_today(db: Session = Depends(get_journal_db)):
    """
    Prüft welche Medikamente heute noch nicht als 'taken' bestätigt wurden.
    'skipped' zählt NICHT als erledigt — nur 'taken' schliesst ab.
    Gibt Liste von {id, name, dosage} zurück für die Erinnerung.
    Leere Liste = alles erledigt oder Tracker deaktiviert.
    """
    require_unlocked()

    # Prüfen ob Tracker aktiviert ist
    settings = db.query(MedicationSettings).first()
    if not settings or not settings.is_enabled:
        return []

    key = session_manager.get_key()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Alle aktiven Medikamente laden
    meds = db.query(Medication).filter(Medication.is_deleted == 0).all()
    if not meds:
        return []

    # Für jedes Medikament prüfen ob heute ein 'taken' Log existiert
    pending = []
    for med in meds:
        try:
            med_data = _decrypt_medication(med, key)
        except Exception:
            continue

        # Alle Logs dieses Medikaments durchgehen
        logs = db.query(IntakeLog).filter(
            IntakeLog.medication_id == med.id
        ).all()

        taken_today = False
        for log in logs:
            try:
                log_date = decrypt_text(log.encrypted_date, key)
                if log_date == today:
                    log_status = decrypt_text(log.encrypted_status, key)
                    # Nur 'taken' zählt als erledigt
                    if log_status == "taken":
                        taken_today = True
                        break
            except Exception:
                continue

        if not taken_today:
            pending.append({
                "id": med_data["id"],
                "name": med_data["name"],
                "dosage": med_data["dosage"],
            })

    return pending