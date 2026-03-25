# Model für Ordner-Hierarchie
# Ordner können andere Ordner oder Module enthalten
# Self-referencing: parent_id zeigt auf einen anderen Ordner (oder NULL für Root)
#
# Beispiel-Struktur:
# Dashboard (Root)
# ├── Studium (Ordner, parent_id=NULL)
# │   ├── Semester 1 (Ordner, parent_id=Studium.id)
# │   │   ├── Lineare Algebra (Modul, folder_id=Semester1.id)
# │   │   └── Statistik (Modul, folder_id=Semester1.id)
# │   └── Semester 2 (Ordner, parent_id=Studium.id)
# └── Ethik (Modul, folder_id=NULL → Root)

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime, timezone
from backend.models.database import Base


class Folder(Base):
    __tablename__ = "folders"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Ordner-Name (z.B. "Studium", "Semester 1")
    name = Column(String, nullable=False)

    # Parent-Ordner — NULL bedeutet Root-Level (Dashboard)
    # Self-referencing Foreign Key: zeigt auf einen anderen Ordner
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True, index=True)

    # Zeitstempel
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))