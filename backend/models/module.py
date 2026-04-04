# Model für Studienmodule (z.B. "Lineare Algebra", "Statistik")
# Jedes Modul kann in einem Ordner liegen (folder_id)
# oder auf Root-Level sein (folder_id=NULL)

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class Module(Base):
    __tablename__ = "modules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    color = Column(String, default="#4a90d9")
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True, index=True)

    # Reihenfolge innerhalb des Ordners (niedrig = oben)
    sort_order = Column(Integer, default=0)

    # Gepinnte Module erscheinen immer zuerst
    is_pinned = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Beziehung: Ein Modul hat viele Dokumente
    documents = relationship("Document", back_populates="module",
                             cascade="all, delete-orphan")
