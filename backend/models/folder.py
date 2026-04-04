# Model für Ordner-Hierarchie
# Ordner können andere Ordner oder Module enthalten
# Self-referencing: parent_id zeigt auf einen anderen Ordner (oder NULL für Root)

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from datetime import datetime, timezone
from backend.models.database import Base


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True, index=True)

    # Reihenfolge innerhalb des Eltern-Ordners (niedrig = oben)
    sort_order = Column(Integer, default=0)

    # Gepinnte Ordner erscheinen immer zuerst
    is_pinned = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
