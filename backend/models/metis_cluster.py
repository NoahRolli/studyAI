# Metis Cluster Model — AI-erkannte Themengruppen im Knowledge-Graph
# Ollama gruppiert Nodes basierend auf Embeddings + Inhaltsanalyse.
# ClusterMember ist die Verbindungstabelle (n:m) zwischen Cluster und Node.

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class MetisCluster(Base):
    """Themengruppe im Metis Knowledge-Graph."""
    __tablename__ = "metis_clusters"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # AI-generiertes Label (z.B. "Machine Learning", "Projektplanung")
    label = Column(String, nullable=False)

    # Kurzbeschreibung des Clusters
    description = Column(Text, nullable=True)

    # Farbe für Visualisierung (Hex, z.B. "#7dd4a3")
    color = Column(String, nullable=True)

    # Zeitstempel
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Mitglieder dieses Clusters
    members = relationship(
        "MetisClusterMember",
        back_populates="cluster",
        cascade="all, delete-orphan",
    )


class MetisClusterMember(Base):
    """Verbindung zwischen Cluster und Node (n:m)."""
    __tablename__ = "metis_cluster_members"

    # Zusammengesetzter Primärschlüssel
    cluster_id = Column(
        Integer,
        ForeignKey("metis_clusters.id", ondelete="CASCADE"),
        primary_key=True,
    )
    node_id = Column(
        Integer,
        ForeignKey("metis_nodes.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Beziehungen
    cluster = relationship("MetisCluster", back_populates="members")
    node = relationship("MetisNode", back_populates="cluster_memberships")
