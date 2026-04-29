# Embedding Service — Persistierte Vektor-Repraesentationen fuer Journal-Eintraege
# Nutzt Ollama mit bge-m3 (1024-dim, multilingual incl. Umlaute)
# Endpoint: /api/embed mit "input"-Key (NICHT das alte /api/embeddings)
#
# Architektur:
# - Embeddings werden beim Entry-Save berechnet (lazy: nur bei neuem/geaendertem Inhalt)
# - Verschluesselt mit AES-256-GCM via crypto_service
# - Persistiert in journal_embeddings Tabelle
# - Genutzt von clustering_service fuer Topic-Cluster
#
# Failover analog zum Pallas-Hauptsystem:
# 2-Attempt-Loop mit invalidate_cache() bei Fehler
# (deckt den Fall: Ollama-URL antwortet auf /api/tags, hat aber bge-m3 nicht)

import hashlib
import httpx
import numpy as np
from sqlalchemy.orm import Session

from backend.journal.infra.journal_config import OLLAMA_EMBED_MODEL
from backend.journal.models.journal_embedding import JournalEmbedding
from backend.journal.services.crypto_service import encrypt_bytes, decrypt_bytes
from backend.infra.ollama_connector import get_ollama_url, invalidate_cache


EMBEDDING_DIM = 1024  # bge-m3 Default
MODEL_VERSION = OLLAMA_EMBED_MODEL


# ============================================
# Hash & Serialisierung
# ============================================

def _compute_content_hash(title: str, content: str) -> str:
    """SHA-256 Hash analog mood_service — fuer Re-Embed-Detection."""
    combined = f"{title}|||{content}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def _serialize_embedding(arr: np.ndarray) -> bytes:
    """Numpy float32 Array zu bytes fuer Verschluesselung/Persistenz."""
    return arr.astype(np.float32).tobytes()


def _deserialize_embedding(data: bytes) -> np.ndarray:
    """Bytes zurueck zu numpy float32 Array."""
    return np.frombuffer(data, dtype=np.float32)


# ============================================
# Ollama-Call
# ============================================

async def _call_ollama_embed(text: str) -> np.ndarray:
    """
    Macht einen einzelnen /api/embed Call gegen die aktuelle Ollama-URL.
    Wirft ConnectionError bei Status != 200.
    """
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{base_url}/api/embed",
            json={
                "model": OLLAMA_EMBED_MODEL,
                "input": text[:2000],
            }
        )
        if response.status_code != 200:
            raise ConnectionError(
                f"Ollama embed fehlgeschlagen (Status {response.status_code}). "
                f"Ist {OLLAMA_EMBED_MODEL} installiert? "
                f"ollama pull {OLLAMA_EMBED_MODEL}"
            )
        data = response.json()
        return np.array(data["embeddings"][0], dtype=np.float32)


async def generate_embedding(text: str) -> np.ndarray:
    """
    Generiert einen Embedding-Vektor mit Failover-Loop.
    Bei Fehler im ersten Versuch: Cache invalidieren, nochmal probieren.
    Deckt Edge-Case "Ollama-URL antwortet, hat aber Model nicht".
    """
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            return await _call_ollama_embed(text)
        except (ConnectionError, httpx.HTTPError, KeyError, ValueError) as e:
            last_error = e
            invalidate_cache()
    raise ConnectionError(
        f"Embedding nach 2 Versuchen fehlgeschlagen: {last_error}"
    )


async def generate_entry_embedding(title: str, content: str) -> np.ndarray:
    """Kombiniert Titel und Inhalt fuer besseren Kontext."""
    combined = f"{title}\n\n{content}"
    return await generate_embedding(combined)


# ============================================
# Aehnlichkeit
# ============================================

def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """
    Cosine-Similarity zwischen zwei Vektoren.
    Akzeptiert numpy-Arrays oder konvertierbare Sequenzen.
    """
    a = np.asarray(vec_a, dtype=np.float32)
    b = np.asarray(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ============================================
# Persistenz: Speichern
# ============================================

async def embed_and_store(
    entry_id: int,
    title: str,
    content: str,
    key: bytes,
    db: Session,
) -> bool:
    """
    Vollstaendiger Flow: Hash-Check → ggf. embedden → encrypt → persist.
    Idempotent: bei unveraendertem Hash wird nichts gemacht.

    Returns:
        True wenn neu/aktualisiert embedded, False wenn Cache-Hit (kein Re-Embed)
    """
    content_hash = _compute_content_hash(title, content)

    # Cache-Check: existiert schon ein Embedding mit gleichem Hash + Modell?
    existing = db.query(JournalEmbedding).filter(
        JournalEmbedding.entry_id == entry_id
    ).first()

    if (
        existing
        and existing.content_hash == content_hash
        and existing.model_version == MODEL_VERSION
    ):
        return False  # Cache-Hit, kein Re-Embed

    # Embedding generieren
    arr = await generate_entry_embedding(title, content)

    # Sanity-Check Dimension
    if arr.shape[0] != EMBEDDING_DIM:
        raise ValueError(
            f"Unerwartete Embedding-Dimension: {arr.shape[0]} "
            f"(erwartet {EMBEDDING_DIM} fuer {MODEL_VERSION})"
        )

    # Encrypten
    encrypted = encrypt_bytes(_serialize_embedding(arr), key)

    # Insert oder Update
    if existing:
        existing.encrypted_embedding = encrypted
        existing.content_hash = content_hash
        existing.model_version = MODEL_VERSION
        existing.embedding_dim = EMBEDDING_DIM
    else:
        db.add(JournalEmbedding(
            entry_id=entry_id,
            encrypted_embedding=encrypted,
            content_hash=content_hash,
            model_version=MODEL_VERSION,
            embedding_dim=EMBEDDING_DIM,
        ))

    db.commit()
    return True


# ============================================
# Persistenz: Laden
# ============================================

def load_embedding(
    entry_id: int,
    key: bytes,
    db: Session,
) -> np.ndarray | None:
    """
    Laed und entschluesselt das Embedding eines einzelnen Eintrags.
    Returns None wenn kein Embedding existiert.
    """
    row = db.query(JournalEmbedding).filter(
        JournalEmbedding.entry_id == entry_id
    ).first()
    if not row:
        return None
    plain_bytes = decrypt_bytes(row.encrypted_embedding, key)
    return _deserialize_embedding(plain_bytes)


def load_all_embeddings(
    key: bytes,
    db: Session,
    model_version: str | None = None,
) -> dict[int, np.ndarray]:
    """
    Laed alle Embeddings als dict[entry_id, ndarray].
    Genutzt vom Cluster-Algorithmus fuer Full-Recluster.
    Optional gefiltert auf bestimmte Modell-Version (default: aktuelle).
    """
    target_version = model_version or MODEL_VERSION
    rows = db.query(JournalEmbedding).filter(
        JournalEmbedding.model_version == target_version
    ).all()
    result: dict[int, np.ndarray] = {}
    for row in rows:
        try:
            plain_bytes = decrypt_bytes(row.encrypted_embedding, key)
            result[row.entry_id] = _deserialize_embedding(plain_bytes)
        except ValueError:
            # Beschaedigtes Embedding ueberspringen statt Crash
            continue
    return result
