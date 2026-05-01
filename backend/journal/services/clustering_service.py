# Clustering Service — Datengetriebenes Topic-Clustering fuer Journal-Eintraege
# Ersetzt das alte LLM-halluzinierte Clustering durch Embedding-basiertes Average-Link
#
# Algorithmus: Hierarchical Clustering mit Average-Link
# - Naive O(n^2) Distance-Matrix (numpy, schnell genug bis ~1000 Entries)
# - Iterativ Cluster mergen bei Avg-Sim >= threshold
# - Robuster gegen Chaining als Single-Link
#
# Persistenz: JournalTopicCluster + JournalEntryClusterMembership
# Labels werden asynchron via LLM generiert (nicht im Cluster-Call inline)

import numpy as np
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from backend.journal.models.journal_entry import JournalEntry
from backend.journal.models.journal_topic_cluster import (
    JournalTopicCluster,
    JournalEntryClusterMembership,
)
from backend.journal.services.embedding_service import (
    cosine_similarity,
    load_all_embeddings,
    EMBEDDING_DIM,
    MODEL_VERSION,
)
from backend.journal.services.crypto_service import (
    encrypt_bytes,
    decrypt_bytes,
    encrypt_text,
    decrypt_text,
)
from backend.journal.services.embedding_service import (
    _serialize_embedding,
    _deserialize_embedding,
)
from backend.journal.services.journal_ai_service import journal_ai
from backend.journal.services.topic_state_service import (
    increment_counter,
    reset_after_recompute,
)


# Konfiguration
DEFAULT_THRESHOLD = 0.65
MIN_CLUSTER_SIZE = 2
TOP_K_FOR_LABEL = 5


# ============================================
# Math-Helpers
# ============================================

def _compute_centroid(embeddings: list[np.ndarray]) -> np.ndarray:
    """Mittelwert-Vektor einer Liste von Embeddings."""
    if not embeddings:
        return np.zeros(EMBEDDING_DIM, dtype=np.float32)
    stacked = np.stack(embeddings)
    return stacked.mean(axis=0).astype(np.float32)


def _compute_cohesion(embeddings: list[np.ndarray], centroid: np.ndarray) -> float:
    """Avg Cosine-Sim aller Embeddings zum Centroid (Cluster-Kohaesion)."""
    if not embeddings:
        return 0.0
    sims = [cosine_similarity(e, centroid) for e in embeddings]
    return float(sum(sims) / len(sims))


def _average_link_similarity(
    embs_a: list[np.ndarray], embs_b: list[np.ndarray]
) -> float:
    """Durchschnittliche Cosine-Sim aller Paare zwischen zwei Clustern."""
    if not embs_a or not embs_b:
        return 0.0
    total = 0.0
    count = 0
    for a in embs_a:
        for b in embs_b:
            total += cosine_similarity(a, b)
            count += 1
    return total / count if count > 0 else 0.0


# ============================================
# Hierarchical Average-Link Clustering
# ============================================

def _hierarchical_cluster(
    entry_embeddings: dict[int, np.ndarray],
    threshold: float,
) -> list[list[int]]:
    """
    Naive O(n^2) Average-Link Clustering.
    Returns: Liste von Clustern, jeder Cluster = Liste von entry_ids.
    """
    entry_ids = list(entry_embeddings.keys())
    if len(entry_ids) < MIN_CLUSTER_SIZE:
        return []

    # Initial: jeder Eintrag ist eigener Cluster
    clusters: list[list[int]] = [[eid] for eid in entry_ids]

    while True:
        if len(clusters) < 2:
            break

        # Finde das Paar mit hoechster Average-Link Similarity
        best_sim = -1.0
        best_pair: tuple[int, int] | None = None

        for i in range(len(clusters)):
            embs_i = [entry_embeddings[eid] for eid in clusters[i]]
            for j in range(i + 1, len(clusters)):
                embs_j = [entry_embeddings[eid] for eid in clusters[j]]
                sim = _average_link_similarity(embs_i, embs_j)
                if sim > best_sim:
                    best_sim = sim
                    best_pair = (i, j)

        # Wenn beste Sim unter Threshold: fertig
        if best_pair is None or best_sim < threshold:
            break

        # Merge die beiden Cluster
        i, j = best_pair
        clusters[i] = clusters[i] + clusters[j]
        clusters.pop(j)

    # Filter Cluster mit zu wenig Members
    return [c for c in clusters if len(c) >= MIN_CLUSTER_SIZE]


# ============================================
# Persistenz: Cluster speichern
# ============================================

def _persist_cluster(
    entry_ids: list[int],
    embeddings: list[np.ndarray],
    key: bytes,
    db: Session,
) -> int:
    """Erstellt einen JournalTopicCluster + Memberships. Returns cluster_id."""
    centroid = _compute_centroid(embeddings)
    cohesion = _compute_cohesion(embeddings, centroid)
    encrypted_centroid = encrypt_bytes(_serialize_embedding(centroid), key)

    cluster = JournalTopicCluster(
        encrypted_centroid=encrypted_centroid,
        entry_count=len(entry_ids),
        cohesion=round(cohesion, 4),
        embedding_dim=EMBEDDING_DIM,
        model_version=MODEL_VERSION,
    )
    db.add(cluster)
    db.flush()  # Damit cluster.id verfuegbar wird

    # Memberships mit Similarity-zu-Centroid
    for eid, emb in zip(entry_ids, embeddings):
        sim = cosine_similarity(emb, centroid)
        db.add(JournalEntryClusterMembership(
            entry_id=eid,
            cluster_id=cluster.id,
            similarity_to_centroid=round(sim, 4),
        ))

    return cluster.id


def _wipe_existing_clusters(db: Session) -> None:
    """Loescht alle existierenden Cluster + Memberships (fuer Full-Recluster)."""
    db.query(JournalEntryClusterMembership).delete()
    db.query(JournalTopicCluster).delete()
    db.flush()


# ============================================
# Public: Full-Recluster
# ============================================

async def cluster_all_entries(
    key: bytes,
    db: Session,
    threshold: float = DEFAULT_THRESHOLD,
) -> dict:
    """
    Full-Recluster: alle Embeddings laden, clustern, persistieren.
    Labels werden NICHT inline generiert (separater Aufruf).
    """
    embeddings = load_all_embeddings(key, db)
    if len(embeddings) < MIN_CLUSTER_SIZE:
        return {
            "status": "insufficient_data",
            "embedding_count": len(embeddings),
            "cluster_count": 0,
        }

    cluster_groups = _hierarchical_cluster(embeddings, threshold)

    _wipe_existing_clusters(db)
    cluster_ids: list[int] = []
    for entry_ids in cluster_groups:
        embs = [embeddings[eid] for eid in entry_ids]
        cid = _persist_cluster(entry_ids, embs, key, db)
        cluster_ids.append(cid)

    # Counter zuruecksetzen + Timestamp setzen - Full-Recompute fertig
    reset_after_recompute(db)

    db.commit()

    return {
        "status": "ok",
        "embedding_count": len(embeddings),
        "cluster_count": len(cluster_ids),
        "cluster_ids": cluster_ids,
        "threshold": threshold,
    }


# ============================================
# Public: Inkrementelle Zuordnung
# ============================================

def assign_entry_to_cluster(
    entry_id: int,
    embedding: np.ndarray,
    key: bytes,
    db: Session,
    threshold: float = DEFAULT_THRESHOLD,
) -> int | None:
    """
    Ordnet einen einzelnen Entry dem naechsten existierenden Cluster zu.
    Returns cluster_id wenn zugeordnet, None wenn kein Cluster nahe genug.
    Beim naechsten Full-Recluster wird der Eintrag mit verarbeitet.
    """
    # Existierende Memberships fuer diesen Entry entfernen (Re-Assign-Szenario)
    db.query(JournalEntryClusterMembership).filter(
        JournalEntryClusterMembership.entry_id == entry_id
    ).delete()

    clusters = db.query(JournalTopicCluster).all()
    best_cluster_id: int | None = None
    best_sim = -1.0

    for cluster in clusters:
        try:
            centroid_bytes = decrypt_bytes(cluster.encrypted_centroid, key)
        except ValueError:
            continue
        centroid = _deserialize_embedding(centroid_bytes)
        sim = cosine_similarity(embedding, centroid)
        if sim > best_sim:
            best_sim = sim
            best_cluster_id = cluster.id

    if best_cluster_id is None or best_sim < threshold:
        db.commit()  # Membership-Delete commiten falls vorhanden
        return None

    db.add(JournalEntryClusterMembership(
        entry_id=entry_id,
        cluster_id=best_cluster_id,
        similarity_to_centroid=round(best_sim, 4),
    ))
    db.flush()
    # Entry-Count des Clusters inkrementieren
    cluster = db.query(JournalTopicCluster).filter(
        JournalTopicCluster.id == best_cluster_id
    ).first()
    if cluster:
        member_count = db.query(JournalEntryClusterMembership).filter(
            JournalEntryClusterMembership.cluster_id == best_cluster_id
        ).count()
        cluster.entry_count = member_count

    # Counter inkrementieren - nur bei erfolgreicher Cluster-Zuweisung
    increment_counter(db)

    db.commit()
    return best_cluster_id


# ============================================
# Public: Label-Generation
# ============================================

def _decrypt_top_entries(
    cluster_id: int,
    key: bytes,
    db: Session,
    top_k: int = TOP_K_FOR_LABEL,
) -> list[dict]:
    """Holt Top-K Entries (nahe am Centroid) und entschluesselt sie."""
    members = db.query(JournalEntryClusterMembership).filter(
        JournalEntryClusterMembership.cluster_id == cluster_id
    ).order_by(
        JournalEntryClusterMembership.similarity_to_centroid.desc()
    ).limit(top_k).all()

    result = []
    for m in members:
        entry = db.query(JournalEntry).filter(
            JournalEntry.id == m.entry_id,
            JournalEntry.is_deleted == 0,
        ).first()
        if not entry:
            continue
        try:
            title = decrypt_text(entry.encrypted_title, key)
            content = decrypt_text(entry.encrypted_content, key)
        except ValueError:
            continue
        result.append({"title": title, "content": content[:300]})
    return result


async def regenerate_label(
    cluster_id: int,
    key: bytes,
    db: Session,
    language: str = "de",
) -> str:
    """LLM-Label fuer einen einzelnen Cluster generieren + persistieren."""
    cluster = db.query(JournalTopicCluster).filter(
        JournalTopicCluster.id == cluster_id
    ).first()
    if not cluster:
        return ""

    top_entries = _decrypt_top_entries(cluster_id, key, db)
    if not top_entries:
        return ""

    # Inhalts-Sprache erkennen anhand des Top-Entries (semantisch zentralster)
    from backend.journal.services.language_detect import detect_content_language
    top = top_entries[0]
    sample_text = f"{top['title']} {top['content']}"
    language = detect_content_language(sample_text, fallback=language)  # type: ignore[arg-type]

    snippets = "\n".join(
        f"- {e['title']}: {e['content'][:150]}" for e in top_entries
    )

    if language == "de":
        prompt = f"""Diese Tagebucheintraege gehoeren thematisch zusammen.
Gib dem Thema einen kurzen, praegnanten Titel (1-3 Woerter, Substantiv).
Vermeide generische Floskeln wie "Neuanfang", "Reflexion", "Gefuehle".
Bevorzuge konkrete Lebensbereiche: Arbeit, Familie, Sport, etc.
Antworte NUR mit dem Titel, kein anderer Text.

Eintraege:
{snippets}"""
        fallback = "Themengruppe"
    else:
        prompt = f"""These journal entries share a topic.
Give the topic a short, concrete title (1-3 words, noun).
Avoid generic phrases like "new beginning", "reflection", "feelings".
Prefer concrete life areas: work, family, sports, etc.
Respond ONLY with the title, no other text.

Entries:
{snippets}"""
        fallback = "Topic Group"

    try:
        result = await journal_ai._chat(prompt=prompt, max_tokens=50)
        label = result.strip().strip('"').strip("'").split("\n")[0][:60]
        if not label:
            label = fallback
    except Exception:
        label = fallback

    cluster.encrypted_label = encrypt_text(label, key)
    cluster.label_generated_at = datetime.now(timezone.utc)
    db.commit()
    return label


async def regenerate_all_labels(
    key: bytes,
    db: Session,
    language: str = "de",
) -> int:
    """Alle Cluster-Labels neu generieren. Returns Anzahl verarbeiteter Cluster."""
    clusters = db.query(JournalTopicCluster).all()
    count = 0
    for cluster in clusters:
        await regenerate_label(cluster.id, key, db, language)
        count += 1
    return count
