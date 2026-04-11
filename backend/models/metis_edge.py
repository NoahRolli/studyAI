# MetisEdge — Legacy Model, nicht mehr aktiv genutzt
# Tabelle existiert noch in DB, wird aber nicht mehr beschrieben
# Konzept-Graph nutzt jetzt ConceptEdge

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from datetime import datetime, timezone
from backend.models.database import Base


class MetisEdge(Base):
    """Legacy-Edge im alten Metis Knowledge-Graph."""
    __tablename__ = "metis_edges"

    id = Column(Integer, primary_key=True, index=True)
    source_node_id = Column(Integer, ForeignKey("metis_nodes.id"), nullable=False)
    target_node_id = Column(Integer, ForeignKey("metis_nodes.id"), nullable=False)
    relation_type = Column(String, default="similarity", nullable=False)
    strength = Column(Float, default=0.5, nullable=False)
    status = Column(String, default="suggested", nullable=False)
    reason = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
