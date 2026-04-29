# Journal Embedding — Verschlüsselte Vektor-Repräsentation eines Eintrags
# Wird beim Entry-Save berechnet und persistiert (lazy: nur wenn nötig)
# Genutzt fuer Topic-Clustering und kuenftig "aehnliche Eintraege"-Features
#
# Strategie analog MoodCache:
# - SHA-256 Hash ueber entschluesselten Title+Content
# - Bei Hash-Aenderung wird neu embedded
#
# Verschluesselt mit AES-256-GCM (gleicher Key wie Entry selbst)
# Embedding-Vektor: 1024-dim float32 (bge-m3) -> 4096 bytes plain
# Verschluesselt: ~4124 bytes (12 IV + 4096 + 16 AuthTag)

from sqlalchemy import Column, Integer, LargeBinary, String, DateTime
from datetime import datetime, timezone
from backend.journal.models.journal_database import JournalBase


class JournalEmbedding(JournalBase):
    """Persistierte, verschluesselte Embeddings pro Journal-Eintrag."""

    __tablename__ = "journal_embeddings"

    # Primaerschluessel = Entry-ID (1:1 Beziehung zu JournalEntry)
    entry_id = Column(Integer, primary_key=True)

    # Verschluesselter Embedding-Vektor
    # Format: IV (12 bytes) + AES-GCM(numpy.float32-bytes) + AuthTag (16 bytes)
    # Decrypt liefert bytes zurueck, np.frombuffer(..., dtype=np.float32)
    encrypted_embedding = Column(LargeBinary, nullable=False)

    # SHA-256 Hash des entschluesselten Inhalts (title + content)
    # Aenderung -> Re-Embed beim naechsten Mood-Analyse-Lauf
    content_hash = Column(String(64), nullable=False)

    # Modell-Version (z.B. "bge-m3", "nomic-embed-text")
    # Bei Modell-Wechsel koennen wir nach model_version filtern und re-embedden
    model_version = Column(String(32), nullable=False, default="bge-m3")

    # Embedding-Dimension (bge-m3 = 1024, nomic = 768)
    # Redundant aber nuetzlich fuer Sanity-Checks beim Decrypt
    embedding_dim = Column(Integer, nullable=False, default=1024)

    # Zeitstempel der letzten Embedding-Berechnung
    embedded_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
