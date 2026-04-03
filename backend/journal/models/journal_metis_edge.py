# Journal Metis Edge — Verschlüsselte Verbindung zwischen Nodes
# Relation-Typen: "similarity" (AI), "wikilink", "manual", "cross"
# "cross" = Verbindung zu öffentlichem Metis-Node (read-only Referenz)

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class JournalMetisEdge(JournalBase):
    """Kante im verschlüsselten Journal-Metis-Graph."""
    __tablename__ = "journal_metis_edges"

    id = Column(Integer, primary_key=True, index=True)

    # Quell- und Ziel-Node
    source_node_id = Column(
        Integer, ForeignKey("journal_metis_nodes.id"), nullable=False
    )
    target_node_id = Column(
        Integer, ForeignKey("journal_metis_nodes.id"), nullable=False
    )

    # Typ: "similarity", "wikilink", "manual", "cross"
    relation_type = Column(String, default="similarity")

    # Stärke 0.0–1.0
    strength = Column(Float, default=0.5)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    source_node = relationship(
        "JournalMetisNode",
        foreign_keys=[source_node_id],
        back_populates="edges_out",
    )
    target_node = relationship(
        "JournalMetisNode",
        foreign_keys=[target_node_id],
        back_populates="edges_in",
    )
