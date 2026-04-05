# Relation + RelationType Models — Typisierte Wissensrelationen
# Tripel-Struktur: source (Subjekt) → relation_type (Prädikat) → target (Objekt)
# Status: suggested (AI-Vorschlag), confirmed (bestätigt), rejected (abgelehnt)
# Quelle: user (manuell) oder ollama (AI-generiert)

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from backend.models.database import Base


class RelationType(Base):
    """Relationstyp — built-in oder custom definiert"""
    __tablename__ = "relation_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Interner Name (z.B. 'builds_on', 'contradicts')
    name = Column(String, unique=True, nullable=False)
    # Anzeige-Labels für UI
    label_de = Column(String, nullable=False)
    label_en = Column(String, nullable=False)
    # Beschreibung für Ollama-Kontext
    description = Column(Text, nullable=True)
    # Built-in Typen können nicht gelöscht werden
    is_builtin = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class Relation(Base):
    """Einzelne Wissensrelation — Tripel mit Status und Begründung"""
    __tablename__ = "relations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Subjekt — Quell-Node (note, summary, module)
    source_type = Column(String, nullable=False)
    source_id = Column(Integer, nullable=False)
    # Objekt — Ziel-Node (note, summary, module)
    target_type = Column(String, nullable=False)
    target_id = Column(Integer, nullable=False)
    # Prädikat — Relationstyp (FK auf relation_types)
    relation_type_id = Column(Integer, ForeignKey("relation_types.id"), nullable=False)
    # Status: suggested, confirmed, rejected
    status = Column(String, default="confirmed")
    # Begründung — warum diese Verbindung (AI-Erklärung oder User-Notiz)
    reason = Column(Text, nullable=True)
    # Erstellt von: 'user' (manuell) oder 'ollama' (AI-Vorschlag)
    created_by = Column(String, default="user")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
