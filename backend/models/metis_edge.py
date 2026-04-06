# Metis Edge Model — Beziehung zwischen zwei Nodes im Knowledge-Graph
# Edges können manuell (WikiLinks), AI-generiert oder bestätigt/abgelehnt sein.
# Status: "suggested" (neu), "confirmed" (bestätigt), "rejected" (abgelehnt)

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class MetisEdge(Base):
    """Kante zwischen zwei Metis-Nodes."""
    __tablename__ = "metis_edges"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Quell-Node (von wo die Verbindung ausgeht)
    source_node_id = Column(
        Integer,
        ForeignKey("metis_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Ziel-Node (wohin die Verbindung geht)
    target_node_id = Column(
        Integer,
        ForeignKey("metis_nodes.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Art der Beziehung
    # "wikilink" — manuell via [[Link]] in Notes
    # "related" — AI-erkannte Ähnlichkeit (Embedding-basiert)
    # "builds_on" — AI: Thema baut auf anderem auf
    # "contradicts" — AI: Themen widersprechen sich
    relation_type = Column(String, nullable=False, default="related")

    # Stärke der Verbindung (0.0–1.0)
    # WikiLinks immer 1.0, AI-Edges basierend auf Cosine-Similarity
    strength = Column(Float, nullable=False, default=0.5)

    # Review-Status: suggested, confirmed, rejected
    # WikiLinks starten als "confirmed" (manuell erstellt)
    status = Column(String, nullable=False, default="suggested")

    # Begründung bei Bestätigung/Ablehnung (optional)
    reason = Column(Text, nullable=True)

    # Zeitpunkt der Bestätigung/Ablehnung
    reviewed_at = Column(DateTime, nullable=True)

    # Zeitstempel
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Pro Node-Paar + Relation-Typ nur eine Edge
    __table_args__ = (
        UniqueConstraint(
            "source_node_id", "target_node_id", "relation_type",
            name="uq_metis_edge_src_tgt_rel",
        ),
    )

    # Beziehungen zurück zu den Nodes
    source_node = relationship(
        "MetisNode",
        foreign_keys=[source_node_id],
        back_populates="edges_out",
    )
    target_node = relationship(
        "MetisNode",
        foreign_keys=[target_node_id],
        back_populates="edges_in",
    )
