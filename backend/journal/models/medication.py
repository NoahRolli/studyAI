# Models für den Medikamenten-Tracker
# Zwei Tabellen: Medikamente und Einnahme-Log
# Alle sensiblen Felder werden AES-256-GCM verschlüsselt (wie Journal-Entries)
# Ohne korrektes Passwort sind Name, Dosis, Notizen etc. unlesbar
#
# MedicationSettings: Speichert ob der Tracker aktiviert ist (nicht verschlüsselt)
# Medication: Ein Medikament mit verschlüsselten Details
# IntakeLog: Tägliche Einnahme-Protokolle (verschlüsselt)

from sqlalchemy import Column, Integer, LargeBinary, DateTime
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class MedicationSettings(JournalBase):
    """
    Globale Einstellung: Ist der Medikamenten-Tracker aktiviert?
    Nicht verschlüsselt — enthält keine sensiblen Daten.
    Es gibt immer nur eine Zeile (id=1).
    """
    __tablename__ = "medication_settings"

    id = Column(Integer, primary_key=True, default=1)
    # 0 = deaktiviert, 1 = aktiviert
    is_enabled = Column(Integer, default=0)


class Medication(JournalBase):
    """
    Ein Medikament mit verschlüsselten Details.
    Verschlüsselte Felder: Name, Dosis, Frequenz, Start-/End-Datum, Notizen
    Jedes Feld enthält IV + Ciphertext + AuthTag als bytes.
    """
    __tablename__ = "medications"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Verschlüsselte Felder — z.B. "Ibuprofen 400mg"
    encrypted_name = Column(LargeBinary, nullable=False)

    # Dosis — z.B. "400mg" oder "2 Tabletten"
    encrypted_dosage = Column(LargeBinary, nullable=False)

    # Frequenz — z.B. "2x täglich", "bei Bedarf"
    encrypted_frequency = Column(LargeBinary, nullable=False)

    # Start-Datum — wann begonnen (ISO-Format)
    encrypted_start_date = Column(LargeBinary, nullable=False)

    # End-Datum — optional, null wenn noch aktiv
    # nullable=True weil laufende Medikamente kein End-Datum haben
    encrypted_end_date = Column(LargeBinary, nullable=True)

    # Notizen/Nebenwirkungen — optional, Freitext
    encrypted_notes = Column(LargeBinary, nullable=True)

    # Nicht-sensitive Metadaten
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Soft-Delete (wie bei Journal-Entries)
    is_deleted = Column(Integer, default=0)


class IntakeLog(JournalBase):
    """
    Tägliches Einnahme-Protokoll für ein Medikament.
    Verschlüsselte Felder: Datum und Status (genommen/nicht genommen)
    medication_id ist NICHT verschlüsselt — nötig für DB-Queries.
    """
    __tablename__ = "intake_logs"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Fremdschlüssel — welches Medikament (nicht verschlüsselt für Queries)
    medication_id = Column(Integer, nullable=False, index=True)

    # Verschlüsseltes Datum — wann die Einnahme war (ISO-Format)
    encrypted_date = Column(LargeBinary, nullable=False)

    # Verschlüsselter Status — "taken" oder "skipped"
    encrypted_status = Column(LargeBinary, nullable=False)

    # Nicht-sensitive Metadaten
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))