# Konzept-Graph Models — Schlagworte als eigenständige Entitäten
# Drei Tabellen: concepts (Nodes), concept_sources (many-to-many Brücke),
# concept_edges (Relationen zwischen Konzepten)

from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.models.database import Base


class Concept(Base):
    """Ein Konzept/Schlagwort im Wissens-Graph."""
    __tablename__ = "concepts"

    id = Column(Integer, primary_key=True, index=True)

    # Name des Konzepts (unique, lowercase-normalisiert)
    name = Column(String, nullable=False, unique=True)

    # AI-generierte Beschreibung (optional)
    description = Column(Text, nullable=True)

    # Embedding-Vektor als JSON-String (nomic-embed-text, 768-dim)
    embedding = Column(Text, nullable=True)

    # True wenn Name/Description sich geändert hat
    embedding_stale = Column(Boolean, default=True, nullable=False)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Beziehungen
    sources = relationship(
        "ConceptSource", back_populates="concept",
        cascade="all, delete-orphan"
    )
    edges_out = relationship(
        "ConceptEdge", foreign_keys="ConceptEdge.source_concept_id",
        back_populates="source_concept", cascade="all, delete-orphan"
    )
    edges_in = relationship(
        "ConceptEdge", foreign_keys="ConceptEdge.target_concept_id",
        back_populates="target_concept", cascade="all, delete-orphan"
    )


class ConceptSource(Base):
    """Brücke zwischen Konzept und Quell-Dokument (many-to-many)."""
    __tablename__ = "concept_sources"

    id = Column(Integer, primary_key=True, index=True)

    # FK zum Konzept
    concept_id = Column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=False
    )

    # Quell-Typ: "note", "summary"
    source_type = Column(String, nullable=False)

    # ID der Quelle (notes.id oder summaries.id)
    source_id = Column(Integer, nullable=False)

    # Wie zentral ist das Konzept für diese Quelle (0.0 - 1.0)
    relevance = Column(Float, default=0.5, nullable=False)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Keine doppelten Verknüpfungen
    __table_args__ = (
        UniqueConstraint(
            "concept_id", "source_type", "source_id",
            name="uq_concept_source"
        ),
    )

    concept = relationship("Concept", back_populates="sources")


class ConceptEdge(Base):
    """Relation zwischen zwei Konzepten."""
    __tablename__ = "concept_edges"

    id = Column(Integer, primary_key=True, index=True)

    # Quell-Konzept
    source_concept_id = Column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=False
    )

    # Ziel-Konzept
    target_concept_id = Column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=False
    )

    # Relationstyp: related, builds_on, contradicts, part_of
    relation_type = Column(String, default="related", nullable=False)

    # Stärke der Verbindung (0.0 - 1.0)
    strength = Column(Float, default=0.5, nullable=False)

    # Von AI erstellt?
    ai_generated = Column(Boolean, default=True, nullable=False)

    # Vom User bestätigt/abgelehnt? (None = pending)
    confirmed = Column(Boolean, nullable=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Keine doppelten Edges zwischen gleichen Konzepten
    __table_args__ = (
        UniqueConstraint(
            "source_concept_id", "target_concept_id",
            name="uq_concept_edge"
        ),
    )

    source_concept = relationship(
        "Concept", foreign_keys=[source_concept_id],
        back_populates="edges_out"
    )
    target_concept = relationship(
        "Concept", foreign_keys=[target_concept_id],
        back_populates="edges_in"
    )


class ConceptCluster(Base):
    """Thematische Gruppierung von Konzepten (AI-generiert)."""
    __tablename__ = "concept_clusters"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    members = relationship(
        "ConceptClusterMember", back_populates="cluster",
        cascade="all, delete-orphan"
    )


class ConceptClusterMember(Base):
    """Zuordnung Konzept → Cluster."""
    __tablename__ = "concept_cluster_members"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(
        Integer, ForeignKey("concept_clusters.id", ondelete="CASCADE"),
        nullable=False
    )
    concept_id = Column(
        Integer, ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "cluster_id", "concept_id",
            name="uq_concept_cluster_member"
        ),
    )

    cluster = relationship("ConceptCluster", back_populates="members")
    concept = relationship("Concept")
