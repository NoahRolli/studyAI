# Journal Metis Node — Verschlüsselter Knowledge-Graph Node
# Liegt in der Journal-DB (isoliert von Haupt-DB).
# Typen: "entry" (Journal-Eintrag), plus Read-Only Referenz auf öffentliche Metis.
# Label wird AES-256-GCM verschlüsselt gespeichert.

from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, LargeBinary
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class JournalMetisNode(JournalBase):
    """Knoten im verschlüsselten Journal-Metis-Graph."""
    __tablename__ = "journal_metis_nodes"

    id = Column(Integer, primary_key=True, index=True)

    # Typ: "entry" (Journal-Eintrag)
    type = Column(String, nullable=False)

    # ID der Quelle (journal_entries.id)
    source_id = Column(Integer, nullable=False)

    # Verschlüsselter Label/Titel (AES-256-GCM)
    encrypted_label = Column(LargeBinary, nullable=True)

    # IV für Label-Verschlüsselung
    label_iv = Column(LargeBinary, nullable=True)

    # Embedding als JSON-String (wird im RAM entschlüsselt berechnet)
    embedding = Column(Text, nullable=True)

    # True wenn Quell-Content geändert seit letztem Embedding
    embedding_stale = Column(Boolean, default=True, nullable=False)

    # Position im 2D-Graph (nullable = auto-layout)
    pos_x = Column(Float, nullable=True)
    pos_y = Column(Float, nullable=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Keine Duplikate pro Typ + Source
    __table_args__ = (
        UniqueConstraint("type", "source_id", name="uq_jmetis_node_type_source"),
    )

    # Beziehungen
    edges_out = relationship(
        "JournalMetisEdge",
        foreign_keys="JournalMetisEdge.source_node_id",
        back_populates="source_node",
        cascade="all, delete-orphan",
    )
    edges_in = relationship(
        "JournalMetisEdge",
        foreign_keys="JournalMetisEdge.target_node_id",
        back_populates="target_node",
        cascade="all, delete-orphan",
    )
    cluster_memberships = relationship(
        "JournalMetisClusterMember",
        back_populates="node",
        cascade="all, delete-orphan",
    )
