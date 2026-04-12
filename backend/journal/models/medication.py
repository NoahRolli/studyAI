# Models für den Medikamenten-Tracker
# Tabellen: Medikamente, Einnahme-Log, Dosis-Änderungen
# Alle sensiblen Felder werden AES-256-GCM verschlüsselt
# Ohne korrektes Passwort sind Name, Dosis, Notizen etc. unlesbar
#
# MedicationSettings: Tracker aktiviert? (nicht verschlüsselt)
# Medication: Ein Medikament mit verschlüsselten Details
# IntakeLog: Tägliche Einnahme-Protokolle (verschlüsselt)
# DoseChange: Historie von Dosis-Änderungen mit Grund

from sqlalchemy import Column, Integer, LargeBinary, DateTime
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class MedicationSettings(JournalBase):
    """Globale Einstellung: Ist der Tracker aktiviert? (id=1)"""
    __tablename__ = "medication_settings"

    id = Column(Integer, primary_key=True, default=1)
    is_enabled = Column(Integer, default=0)


class Medication(JournalBase):
    """Ein Medikament mit verschlüsselten Details."""
    __tablename__ = "medications"

    id = Column(Integer, primary_key=True, index=True)
    encrypted_name = Column(LargeBinary, nullable=False)
    encrypted_dosage = Column(LargeBinary, nullable=False)
    encrypted_frequency = Column(LargeBinary, nullable=False)
    encrypted_start_date = Column(LargeBinary, nullable=False)
    encrypted_end_date = Column(LargeBinary, nullable=True)
    encrypted_notes = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
    is_deleted = Column(Integer, default=0)


class IntakeLog(JournalBase):
    """Tägliches Einnahme-Protokoll mit optionalen Notizen."""
    __tablename__ = "intake_logs"

    id = Column(Integer, primary_key=True, index=True)
    medication_id = Column(Integer, nullable=False, index=True)
    encrypted_date = Column(LargeBinary, nullable=False)
    encrypted_status = Column(LargeBinary, nullable=False)
    # Optionale Notizen zur Einnahme (z.B. "halbe Dosis", "Kopfschmerzen")
    encrypted_notes = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DoseChange(JournalBase):
    """Dosis-Änderung mit verschlüsseltem Grund und alter/neuer Dosis."""
    __tablename__ = "dose_changes"

    id = Column(Integer, primary_key=True, index=True)
    medication_id = Column(Integer, nullable=False, index=True)
    encrypted_old_dosage = Column(LargeBinary, nullable=False)
    encrypted_new_dosage = Column(LargeBinary, nullable=False)
    encrypted_reason = Column(LargeBinary, nullable=True)
    encrypted_date = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
