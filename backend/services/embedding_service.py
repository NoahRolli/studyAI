# Embedding Service — Shared Embeddings via bge-m3
# Wird von Konzept-Graph, Journal-Metis und Delphi-Retrieval genutzt.
# Ollama /api/embed Endpoint (neue API), Cosine Similarity.
#
# Failover-Pattern (analog zu ollama_provider._chat):
# - Bei Fehler im 1. Attempt: invalidate_cache() + retry
# - Connector probiert dann naechsten Primary-Endpoint
# - Nach 2 Attempts: ConnectionError raisen

import numpy as np
import httpx
import logging
from backend.infra.ollama_connector import get_ollama_url, invalidate_cache
from backend.infra.config import OLLAMA_EMBED_MODEL

logger = logging.getLogger(__name__)


async def generate_embedding(text: str) -> list[float]:
    """Generiert Embedding-Vektor via bge-m3 auf Ollama.

    Nutzt /api/embed (neue API ab Ollama 0.2+); die alte /api/embeddings
    liefert fuer manche Modelle fehlerhafte (konstante) Vektoren.

    Bei Fehler im 1. Versuch wird der Connector-Cache invalidiert und mit
    dem naechsten Primary-Endpoint erneut versucht. Verhindert dass ein
    Endpoint der zwar /api/tags beantwortet, aber das Model nicht hat,
    den Service permanent blockt.
    """
    last_error: Exception | None = None

    for attempt in range(2):
        base_url = await get_ollama_url()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{base_url}/api/embed",
                    json={
                        "model": OLLAMA_EMBED_MODEL,
                        "input": text[:2000],
                    },
                )
                if resp.status_code != 200:
                    raise ConnectionError(
                        f"Embedding fehlgeschlagen: "
                        f"{resp.status_code} auf {base_url}"
                    )
                data = resp.json()
                embeddings = data.get("embeddings")
                if not embeddings or not isinstance(embeddings, list):
                    raise ValueError(
                        f"Ungueltige Embedding-Antwort von {base_url}: {data}"
                    )
                return embeddings[0]

        except Exception as e:
            last_error = e
            if attempt == 0:
                logger.warning(
                    f"Embedding-Attempt 1 auf {base_url} fehlgeschlagen "
                    f"({type(e).__name__}: {e}) — invalidate cache + retry"
                )
                invalidate_cache()
                continue
            # Zweiter Attempt fehlgeschlagen -> raisen
            raise ConnectionError(
                f"Embedding nicht erreichbar nach Retry: {last_error}"
            )

    # Defensiv: sollte nie erreicht werden
    raise ConnectionError(
        f"Embedding: alle Versuche fehlgeschlagen ({last_error})"
    )


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Kosinus-Aehnlichkeit zwischen zwei Vektoren (0.0 bis 1.0)."""
    va, vb = np.array(a), np.array(b)
    norm_a, norm_b = np.linalg.norm(va), np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))
