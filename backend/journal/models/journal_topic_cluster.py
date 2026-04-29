# Journal Topic Cluster — Datenbasierte Themen-Cluster fuer Insights
# Gruppiert Eintraege via Embedding-Aehnlichkeit (kein LLM-Halluzinieren)
# Label wird vom LLM aus Cluster-Inhalten generiert und verschluesselt gespeichert
#
# Verhaeltnis zu anderen Cluster-Konzepten:
# - concept_clusters (Pallas-Haupt-DB): Cluster im Concept-Graph
# - journal_metis_clusters: Cluster fuer Journal-Metis-Sphaere
# - journal_topic_clusters: NEU - Cluster fuer Insights-Topics
#
# Architektur:
# - JournalTopicCluster: ein Cluster = ein Thema
# - JournalEntryClusterMembership: Junction Entry <-> Cluster mit Similarity-Score

from sqlalchemy import Column, Integer, LargeBinary, String, Float, DateTime
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class JournalTopicCluster(JournalBase):
    """Ein datengetriebenes Thema im Journal — basiert auf Embedding-Clustering."""

    __tablename__ = "journal_topic_clusters"

    # Auto-generierte Cluster-ID (kann sich beim Re-Cluster aendern)
    id = Column(Integer, primary_key=True, index=True)

    # Verschluesselter Label-Text (z.B. "Job-Wechsel", "Familie", "Sport")
    # Vom LLM generiert aus den Inhalten des Clusters
    # Format: IV (12) + AES-GCM(label-utf8) + AuthTag (16)
    # Nullable weil bei Erstellung noch ohne Label - wird async vom LLM gefuellt
    encrypted_label = Column(LargeBinary, nullable=True)

    # Verschluesselter Centroid-Vektor (Mittelpunkt aller Entry-Embeddings im Cluster)
    # Genutzt fuer "naechster Cluster fuer neuen Entry"-Lookup
    # Format: IV (12) + AES-GCM(numpy.float32-bytes) + AuthTag (16)
    encrypted_centroid = Column(LargeBinary, nullable=False)

    # Anzahl Entries im Cluster (Statistik, Klartext)
    entry_count = Column(Integer, nullable=False, default=0)

    # Cluster-Kohaesion: durchschnittliche Cosine-Sim aller Entries zum Centroid
    # 1.0 = identisch, 0.7 = stark verwandt, 0.5 = lose Gruppierung
    # Klartext-Float weil nur Statistik, keine Themen-Info
    cohesion = Column(Float, nullable=False, default=0.0)

    # Embedding-Dimension (sollte mit JournalEmbedding.embedding_dim uebereinstimmen)
    embedding_dim = Column(Integer, nullable=False, default=1024)

    # Modell-Version — bei Wechsel mussen alle Cluster neu berechnet werden
    model_version = Column(String(32), nullable=False, default="bge-m3")

    # Wann wurde dieser Cluster zuletzt vom Cluster-Algorithmus aktualisiert
    last_clustered_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Wann wurde das Label zuletzt vom LLM generiert (kann separat vom Cluster sein)
    label_generated_at = Column(DateTime, nullable=True)


class JournalEntryClusterMembership(JournalBase):
    """Junction-Tabelle: welche Entries gehoeren zu welchem Cluster."""

    __tablename__ = "journal_entry_cluster_membership"

    # Composite Primary Key: ein Entry kann zu mehreren Clustern gehoeren
    # (z.B. wenn Entry sowohl "Sport" als auch "Familie" anschneidet)
    entry_id = Column(Integer, primary_key=True)
    cluster_id = Column(Integer, primary_key=True)

    # Wie nah ist dieser Entry am Cluster-Centroid (Cosine-Sim)
    # Nuetzlich fuer "Kernzitat des Clusters" (hoechste Sim) und Outlier-Detection
    similarity_to_centroid = Column(Float, nullable=False, default=0.0)

    # Wann wurde diese Zuordnung getroffen
    # Bei Inkrementell-Assign vs. Full-Recluster unterschiedlich
    assigned_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
    )
