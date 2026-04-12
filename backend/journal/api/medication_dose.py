# Dosis-Änderungen API — Historie und Abfrage
# Verschlüsselt wie alle Medication-Daten (AES-256-GCM)
#
# Endpunkte:
# GET  /api/journal/medications/dose-history/{med_id} — Alle Änderungen
# POST /api/journal/medications/dose-change — Manueller Eintrag

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.journal.models.journal_database import get_journal_db
from backend.journal.models.medication import Medication, DoseChange
from backend.journal.services.session_service import session_manager
from backend.journal.services.crypto_service import encrypt_text, decrypt_text
from backend.journal.api.dependencies import require_unlocked
from pydantic import BaseModel
from typing import Optional

router = APIRouter(
    prefix="/api/journal/medications",
    tags=["journal-medications"],
)


class DoseChangeCreate(BaseModel):
    """Manuelle Dosis-Änderung erfassen."""
    medication_id: int
    old_dosage: str
    new_dosage: str
    reason: Optional[str] = None
    date: Optional[str] = None


def _decrypt_dose_change(dc: DoseChange, key: bytes) -> dict:
    """Entschlüsselt eine Dosis-Änderung."""
    return {
        "id": dc.id,
        "medication_id": dc.medication_id,
        "old_dosage": decrypt_text(dc.encrypted_old_dosage, key),
        "new_dosage": decrypt_text(dc.encrypted_new_dosage, key),
        "reason": (
            decrypt_text(dc.encrypted_reason, key)
            if dc.encrypted_reason else None
        ),
        "date": decrypt_text(dc.encrypted_date, key),
        "created_at": dc.created_at.isoformat(),
    }


@router.get("/dose-history/{med_id}")
def get_dose_history(
    med_id: int,
    db: Session = Depends(get_journal_db),
):
    """Alle Dosis-Änderungen eines Medikaments (chronologisch)."""
    require_unlocked()
    key = session_manager.get_key()
    changes = db.query(DoseChange).filter(
        DoseChange.medication_id == med_id
    ).order_by(DoseChange.created_at.desc()).all()
    result = []
    for dc in changes:
        try:
            result.append(_decrypt_dose_change(dc, key))
        except Exception:
            continue
    return result


@router.post("/dose-change")
def create_dose_change(
    data: DoseChangeCreate,
    db: Session = Depends(get_journal_db),
):
    """Dosis-Änderung manuell erfassen."""
    require_unlocked()
    med = db.query(Medication).filter(
        Medication.id == data.medication_id,
        Medication.is_deleted == 0,
    ).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medikament nicht gefunden.")

    key = session_manager.get_key()
    date_str = data.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    dc = DoseChange(
        medication_id=data.medication_id,
        encrypted_old_dosage=encrypt_text(data.old_dosage, key),
        encrypted_new_dosage=encrypt_text(data.new_dosage, key),
        encrypted_reason=(
            encrypt_text(data.reason, key) if data.reason else None
        ),
        encrypted_date=encrypt_text(date_str, key),
    )
    db.add(dc)
    db.commit()
    db.refresh(dc)
    return {"id": dc.id, "message": "Dosis-Änderung gespeichert."}
