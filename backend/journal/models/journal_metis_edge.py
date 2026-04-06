# Journal Metis Edge — Verschlüsselte Verbindung zwischen Nodes
# Relation-Typen: "similarity" (AI), "wikilink", "manual", "cross"
# Status: "suggested", "confirmed", "rejected"

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
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

    # Review-Status: suggested, confirmed, rejected
    status = Column(String, nullable=False, default="suggested")

    # Begründung bei Bestätigung/Ablehnung
    reason = Column(Text, nullable=True)

    # Zeitpunkt der Review
    reviewed_at = Column(DateTime, nullable=True)

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
