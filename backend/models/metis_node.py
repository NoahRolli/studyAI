# MetisNode — Legacy Model, nicht mehr aktiv genutzt
# Tabelle existiert noch in DB, wird aber nicht mehr beschrieben
# Konzept-Graph nutzt jetzt Concept/ConceptEdge/ConceptCluster

from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime
from sqlalchemy import UniqueConstraint
from datetime import datetime, timezone
from backend.models.database import Base


class MetisNode(Base):
    """Legacy-Node im alten Metis Knowledge-Graph."""
    __tablename__ = "metis_nodes"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    source_id = Column(Integer, nullable=False)
    embedding = Column(Text, nullable=True)
    embedding_stale = Column(Boolean, default=True, nullable=False)
    pos_x = Column(Float, nullable=True)
    pos_y = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("type", "source_id", name="uq_metis_node_type_source"),
    )
