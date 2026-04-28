"""
Delphi Retrieval-Cache — In-Memory Embedding-Matrix.

Beim ersten Call werden alle Concept-Embeddings aus der DB in eine
numpy float32-Matrix geladen (~50MB RAM bei 12k Concepts x 1024 dim).
Cache lebt fuer die Lifetime des Backend-Containers.

L2-Normalisierung beim Laden: dadurch wird Cosine-Similarity zum
Dot-Product im Retrieval -> schneller, gleiche Resultate.

Thread-safety via asyncio.Lock + Double-Check-Pattern.
"""

import json
import logging
import asyncio
import numpy as np
from typing import Optional
from sqlalchemy.orm import Session

from backend.models.concept import Concept

logger = logging.getLogger(__name__)


# ---------- Module-Level State ----------
_cache_lock = asyncio.Lock()
_embedding_matrix: Optional[np.ndarray] = None  # shape (N, dim), float32
_concept_id_array: Optional[np.ndarray] = None  # shape (N,), int64
_concept_name_array: Optional[list[str]] = None  # length N


def _load_sync(db: Session) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Synchroner Load — wird via asyncio.to_thread aufgerufen.

    Liest alle Concepts mit Embeddings, parsed JSON, baut numpy-Matrix
    und L2-normalisiert die Vektoren.
    """
    rows = (
        db.query(Concept.id, Concept.name, Concept.embedding)
        .filter(Concept.embedding.isnot(None))
        .all()
    )
    if not rows:
        return (
            np.zeros((0, 1024), dtype=np.float32),
            np.zeros((0,), dtype=np.int64),
            [],
        )

    ids: list[int] = []
    names: list[str] = []
    vectors: list[list[float]] = []
    skipped = 0

    for cid, name, emb_json in rows:
        try:
            vec = json.loads(emb_json)
            if not isinstance(vec, list) or len(vec) == 0:
                skipped += 1
                continue
            vectors.append(vec)
            ids.append(cid)
            names.append(name)
        except (json.JSONDecodeError, TypeError):
            skipped += 1
            continue

    matrix = np.asarray(vectors, dtype=np.float32)

    # L2-Normalisieren -> Cosine-Sim wird im Retrieval zum Dot-Product
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-9)
    matrix = matrix / norms

    if skipped > 0:
        logger.warning(
            f"Delphi-Cache: {skipped} Concepts mit invalid embedding skipped"
        )
    return matrix, np.asarray(ids, dtype=np.int64), names


async def _build_cache(db: Session) -> None:
    """Baut den Cache neu auf. Nur unter _cache_lock aufrufen."""
    global _embedding_matrix, _concept_id_array, _concept_name_array

    matrix, ids, names = await asyncio.to_thread(_load_sync, db)
    _embedding_matrix = matrix
    _concept_id_array = ids
    _concept_name_array = names

    logger.info(
        f"Delphi-Cache geladen: {len(ids)} Concepts, "
        f"Matrix-Shape {matrix.shape}, dtype {matrix.dtype}"
    )


async def get_embedding_cache(
    db: Session,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Lazy-Init Cache. Liefert (matrix, concept_ids, concept_names).

    Thread-safe via Lock + Double-Check-Pattern: erste Pruefung ohne Lock
    fuer Performance, zweite Pruefung mit Lock fuer Korrektheit.
    """
    global _embedding_matrix
    if _embedding_matrix is None:
        async with _cache_lock:
            if _embedding_matrix is None:
                await _build_cache(db)

    # Type: ignore weil wir nach _build_cache wissen dass alle non-None sind
    return _embedding_matrix, _concept_id_array, _concept_name_array  # type: ignore


async def invalidate_cache() -> None:
    """Forciert Cache-Reload beim naechsten get_embedding_cache-Call.

    Aufrufen z.B. nach Concept-Embedding-Updates in der DB.
    """
    global _embedding_matrix, _concept_id_array, _concept_name_array
    async with _cache_lock:
        _embedding_matrix = None
        _concept_id_array = None
        _concept_name_array = None
    logger.info("Delphi-Cache invalidiert")
