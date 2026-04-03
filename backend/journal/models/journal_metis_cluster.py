# Journal Metis Cluster — Thematische Gruppierung (verschlüsselt)
# Label und Description werden AES-256-GCM verschlüsselt.

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class JournalMetisCluster(JournalBase):
    """Thematischer Cluster im Journal-Metis-Graph."""
    __tablename__ = "journal_metis_clusters"

    id = Column(Integer, primary_key=True, index=True)

    # Verschlüsseltes Label + Description
    encrypted_label = Column(LargeBinary, nullable=True)
    label_iv = Column(LargeBinary, nullable=True)
    encrypted_description = Column(LargeBinary, nullable=True)
    description_iv = Column(LargeBinary, nullable=True)

    # Farbe (nicht sensitiv — Klartext ok)
    color = Column(String, default="#7dd4a3")

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    members = relationship(
        "JournalMetisClusterMember",
        back_populates="cluster",
        cascade="all, delete-orphan",
    )


class JournalMetisClusterMember(JournalBase):
    """N:M Zuordnung Node ↔ Cluster."""
    __tablename__ = "journal_metis_cluster_members"

    cluster_id = Column(
        Integer, ForeignKey("journal_metis_clusters.id"),
        primary_key=True,
    )
    node_id = Column(
        Integer, ForeignKey("journal_metis_nodes.id"),
        primary_key=True,
    )

    cluster = relationship("JournalMetisCluster", back_populates="members")
    node = relationship("JournalMetisNode", back_populates="cluster_memberships")
