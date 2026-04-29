# Topic Query Service — Read-Pfad fuer Insights-Topics
# Liest aktuelle Cluster aus DB, decrypted Labels, aggregiert Mood
#
# Symmetrisch zu clustering_service.py (Schreib-Pfad):
# - clustering_service.cluster_all_entries() schreibt
# - topic_query_service.get_all_topics() liest
#
# Decrypt-Pattern: identisch zu clustering_service (decrypt_text fuer Label)

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.journal.crypto.aes_gcm import decrypt_text
from backend.journal.models.journal_topic_cluster import (
    JournalTopicCluster,
    JournalEntryClusterMembership,
)
from backend.journal.models.mood_cache import MoodCache
from backend.journal.models.journal_embedding import JournalEmbedding


def get_topics_overview(key: bytes, db: Session) -> dict:
    """
    Liefert kompletten Topic-Stand: alle Cluster mit Labels, Members, Mood.

    Sortiert nach entry_count desc (groesste Cluster oben).
    Cluster ohne Label (z.B. waehrend Recompute) werden mit label=None zurueckgegeben.
    """
    # Total entries: alle Embeddings (auch nicht-clusterte)
    total_entries = db.query(func.count(JournalEmbedding.entry_id)).scalar() or 0

    # Geclusterte Entries: distinct entry_ids in Membership
    clustered_entries = (
        db.query(func.count(func.distinct(JournalEntryClusterMembership.entry_id)))
        .scalar()
        or 0
    )

    # Alle Cluster, sortiert nach Groesse desc
    clusters = (
        db.query(JournalTopicCluster)
        .order_by(JournalTopicCluster.entry_count.desc())
        .all()
    )

    topics = [_build_topic_dict(cluster, key, db) for cluster in clusters]

    return {
        "total_entries": total_entries,
        "clustered_entries": clustered_entries,
        "orphan_count": total_entries - clustered_entries,
        "cluster_count": len(clusters),
        "topics": topics,
    }


def _build_topic_dict(
    cluster: JournalTopicCluster, key: bytes, db: Session
) -> dict:
    """Ein Cluster -> dict mit Label, Members, Mood, Core-Entry."""
    # Label decrypten (kann None sein wenn noch nicht generiert)
    label = None
    if cluster.encrypted_label is not None:
        try:
            label = decrypt_text(cluster.encrypted_label, key)
        except Exception:
            # Korrupte Verschluesselung — Cluster trotzdem zeigen, Label leer
            label = None

    # Members fuer diesen Cluster, sortiert nach Centroid-Naehe desc
    memberships = (
        db.query(JournalEntryClusterMembership)
        .filter(JournalEntryClusterMembership.cluster_id == cluster.id)
        .order_by(JournalEntryClusterMembership.similarity_to_centroid.desc())
        .all()
    )

    member_ids = [m.entry_id for m in memberships]
    core_entry_id = member_ids[0] if member_ids else None

    # Mood-Aggregation: AVG ueber MoodCache.score fuer diese Member
    avg_mood = None
    if member_ids:
        avg_mood = (
            db.query(func.avg(MoodCache.score))
            .filter(MoodCache.entry_id.in_(member_ids))
            .scalar()
        )
        # SQLAlchemy gibt Decimal/float zurueck — auf float casten fuer JSON
        avg_mood = float(avg_mood) if avg_mood is not None else None

    return {
        "cluster_id": cluster.id,
        "label": label,
        "entry_count": cluster.entry_count,
        "cohesion": float(cluster.cohesion),
        "avg_mood": avg_mood,
        "member_entry_ids": member_ids,
        "core_entry_id": core_entry_id,
        "last_clustered_at": (
            cluster.last_clustered_at.isoformat()
            if cluster.last_clustered_at
            else None
        ),
        "label_generated_at": (
            cluster.label_generated_at.isoformat()
            if cluster.label_generated_at
            else None
        ),
    }
