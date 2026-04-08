# Konzept-Graph Models — Schlagworte als eigenständige Entitäten
# concepts (Nodes), concept_sources (many-to-many Brücke),
# concept_edges (vereinheitlichte Relationen — ersetzt relations + metis_edges),
# concept_clusters + concept_cluster_members (thematische Gruppierung)

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
    """Vereinheitlichte Relation zwischen zwei Konzepten.
    Ersetzt: relations + metis_edges + alte concept_edges.
    Confidence ergibt sich aus origin + status (berechnet, nicht gespeichert).
    """
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

    # Relationstyp als FK auf relation_types (is_a, builds_on, etc.)
    relation_type_id = Column(
        Integer, ForeignKey("relation_types.id"),
        nullable=False
    )

    # Stärke der Verbindung (0.0 - 1.0)
    strength = Column(Float, default=0.5, nullable=False)

    # Herkunft der Edge
    # manual = manuell erstellt, ai_suggested = Ollama Einzelvorschlag,
    # ai_auto_link = Batch Auto-Link, wikilink = aus [[Link]],
    # folder_implicit = Archiv-Ordnerstruktur impliziert
    origin = Column(String, default="ai_suggested", nullable=False)

    # Review-Status: suggested, confirmed, rejected
    status = Column(String, default="suggested", nullable=False)

    # Begründung (AI-Erklärung oder User-Notiz)
    reason = Column(Text, nullable=True)

    # Zeitpunkt der Bestätigung/Ablehnung
    reviewed_at = Column(DateTime, nullable=True)

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

    @property
    def confidence(self) -> float:
        """Berechnete Confidence basierend auf origin + status."""
        if self.status == "rejected":
            return 0.0
        scores = {
            "manual": 1.0,
            "wikilink": 0.9,
            "folder_implicit": 0.7,
            "ai_suggested": 0.3,
            "ai_auto_link": 0.3,
        }
        base = scores.get(self.origin, 0.3)
        # Bestätigung hebt AI-Edges auf 0.8
        if self.status == "confirmed" and base < 0.8:
            return 0.8
        return base


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
