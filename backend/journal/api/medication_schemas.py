# Pydantic Schemas für den Medikamenten-Tracker
# Create/Update: Klartext vom Frontend
# Response: Entschlüsselte Daten zurück ans Frontend
# DoseChange: Dosis-Änderung mit Grund
# IntakeLog: Tägliches Tracking mit optionalen Notizen

from pydantic import BaseModel
from typing import Optional


# --- Medikament ---

class MedicationCreate(BaseModel):
    """Neues Medikament anlegen."""
    name: str
    dosage: str
    frequency: str
    start_date: str
    end_date: Optional[str] = None
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    """Medikament aktualisieren — alle Felder optional."""
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    dose_change_reason: Optional[str] = None


class MedicationResponse(BaseModel):
    """Entschlüsseltes Medikament."""
    id: int
    name: str
    dosage: str
    frequency: str
    start_date: str
    end_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


# --- Einnahme-Log ---

class IntakeLogCreate(BaseModel):
    """Einnahme protokollieren — mit optionalen Notizen."""
    medication_id: int
    date: str
    status: str
    notes: Optional[str] = None


class IntakeLogResponse(BaseModel):
    """Entschlüsselter Einnahme-Eintrag."""
    id: int
    medication_id: int
    date: str
    status: str
    notes: Optional[str] = None
    created_at: str


# --- Dosis-Änderung ---

class DoseChangeResponse(BaseModel):
    """Entschlüsselte Dosis-Änderung."""
    id: int
    medication_id: int
    old_dosage: str
    new_dosage: str
    reason: Optional[str] = None
    date: str
    created_at: str


# --- Settings ---

class MedicationSettingsResponse(BaseModel):
    """Tracker-Status."""
    is_enabled: bool
