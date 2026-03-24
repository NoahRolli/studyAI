# Pydantic Schemas für den Medikamenten-Tracker
# Definieren was rein und raus geht — zentral für alle Medication-Endpunkte
#
# Create/Update: Was der User eingibt (Klartext)
# Response: Was das Backend zurückgibt (entschlüsselt)
# IntakeLog: Tägliches Einnahme-Tracking

from pydantic import BaseModel
from typing import Optional


# --- Medikament ---

class MedicationCreate(BaseModel):
    """Neues Medikament anlegen — alle Pflichtfelder als Klartext."""
    name: str                          # z.B. "Ibuprofen"
    dosage: str                        # z.B. "400mg"
    frequency: str                     # z.B. "2x täglich"
    start_date: str                    # ISO-Format, z.B. "2026-03-24"
    end_date: Optional[str] = None     # Optional — null wenn noch aktiv
    notes: Optional[str] = None        # Notizen/Nebenwirkungen


class MedicationUpdate(BaseModel):
    """Medikament aktualisieren — alle Felder optional."""
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None


class MedicationResponse(BaseModel):
    """Entschlüsseltes Medikament — so kommt es zum Frontend."""
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
    """Einnahme protokollieren — ein Medikament an einem Tag."""
    medication_id: int
    date: str                          # ISO-Format, z.B. "2026-03-24"
    status: str                        # "taken" oder "skipped"


class IntakeLogResponse(BaseModel):
    """Entschlüsselter Einnahme-Eintrag."""
    id: int
    medication_id: int
    date: str
    status: str
    created_at: str


# --- Settings ---

class MedicationSettingsResponse(BaseModel):
    """Tracker-Status: aktiviert oder deaktiviert."""
    is_enabled: bool