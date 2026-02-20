# Model für hochgeladene Dokumente (PDF, Word, TXT)
# Jedes Dokument gehört zu genau einem Modul

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class Document(Base):
    __tablename__ = "documents"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Fremdschlüssel — verknüpft Dokument mit einem Modul
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False)

    # Originaler Dateiname (z.B. "Vorlesung_03.pdf")
    filename = Column(String, nullable=False)

    # Speicherpfad auf der SSD (backend_storage)
    file_path = Column(String, nullable=False)

    # Dateityp (pdf, docx, txt)
    file_type = Column(String, nullable=False)

    # Extrahierter Rohtext aus dem Dokument — wird vom Parser befüllt
    raw_text = Column(Text, default="")

    # Zeitstempel des Uploads
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Beziehung: Dokument gehört zu einem Modul
    module = relationship("Module", back_populates="documents")

    # Beziehung: Ein Dokument kann mehrere Zusammenfassungen haben
    summaries = relationship("Summary", back_populates="document",
                             cascade="all, delete-orphan")