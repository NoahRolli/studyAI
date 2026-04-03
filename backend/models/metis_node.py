# Metis Node Model — Repräsentiert eine Entität im Knowledge-Graph
# Jeder Node verweist auf eine existierende Note oder Summary.
# Metis speichert keine Duplikate der Daten — nur Verknüpfungen + AI-Metadaten.

from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class MetisNode(Base):
    """Einzelner Knoten im Metis Knowledge-Graph."""
    __tablename__ = "metis_nodes"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Typ der Quelle: "note" oder "summary"
    type = Column(String, nullable=False)

    # ID der Quelle (notes.id oder summaries.id)
    # Kein FK weil zwei verschiedene Tabellen referenziert werden
    source_id = Column(Integer, nullable=False)

    # Embedding-Vektor als JSON-String (768-dim, nomic-embed-text)
    # Nullable — wird erst bei Auto-Link berechnet
    embedding = Column(Text, nullable=True)

    # True wenn sich der Quell-Content geändert hat seit letztem Embedding
    embedding_stale = Column(Boolean, default=True, nullable=False)

    # Gespeicherte Position im 2D-Graph (nullable = auto-layout)
    # Wenn gesetzt, ist der Node "gepinnt"
    pos_x = Column(Float, nullable=True)
    pos_y = Column(Float, nullable=True)

    # Zeitstempel
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Keine Duplikate: Pro Typ + Source-ID nur ein Node
    __table_args__ = (
        UniqueConstraint("type", "source_id", name="uq_metis_node_type_source"),
    )

    # Beziehungen — Edges wo dieser Node Quelle oder Ziel ist
    edges_out = relationship(
        "MetisEdge",
        foreign_keys="MetisEdge.source_node_id",
        back_populates="source_node",
        cascade="all, delete-orphan",
    )
    edges_in = relationship(
        "MetisEdge",
        foreign_keys="MetisEdge.target_node_id",
        back_populates="target_node",
        cascade="all, delete-orphan",
    )

    # Cluster-Mitgliedschaften
    cluster_memberships = relationship(
        "MetisClusterMember",
        back_populates="node",
        cascade="all, delete-orphan",
    )
