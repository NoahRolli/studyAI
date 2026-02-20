# Model für Studienmodule (z.B. "Lineare Algebra", "Statistik")
# Jedes Modul ist ein Ordner, der Dokumente enthält

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class Module(Base):
    __tablename__ = "modules"

    # Primärschlüssel — wird automatisch hochgezählt
    id = Column(Integer, primary_key=True, index=True)

    # Name des Moduls (z.B. "Mathe 2")
    name = Column(String, nullable=False)

    # Optionale Beschreibung
    description = Column(String, default="")

    # Farbe für die UI-Darstellung (Hex-Code)
    color = Column(String, default="#4a90d9")

    # Zeitstempel — werden automatisch gesetzt
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Beziehung: Ein Modul hat viele Dokumente
    # cascade="all, delete-orphan" → löscht alle Dokumente mit wenn Modul gelöscht wird
    documents = relationship("Document", back_populates="module",
                             cascade="all, delete-orphan")