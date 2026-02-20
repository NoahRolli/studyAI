# Model für AI-generierte Zusammenfassungen
# Jede Zusammenfassung gehört zu einem Dokument und speichert auch die Schlüsselbegriffe

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class Summary(Base):
    __tablename__ = "summaries"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Fremdschlüssel — verknüpft Zusammenfassung mit einem Dokument
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)

    # Die eigentliche Zusammenfassung als Text
    content = Column(Text, nullable=False)

    # Liste von Schlüsselbegriffen (als JSON gespeichert, z.B. ["Vektor", "Matrix"])
    key_terms = Column(JSON, default=list)

    # Welcher AI-Provider wurde genutzt ("claude" oder "ollama")
    ai_provider = Column(String, nullable=False)

    # Zeitstempel der Erstellung
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Beziehung: Zusammenfassung gehört zu einem Dokument
    document = relationship("Document", back_populates="summaries")