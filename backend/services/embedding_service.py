# Embedding Service — Shared Embeddings via nomic-embed-text
# Wird von Konzept-Graph und Journal-Metis genutzt
# Ollama /api/embeddings Endpoint, Cosine Similarity

import numpy as np
import httpx
import logging
from backend.infra.ollama_connector import get_ollama_url
from backend.infra.config import OLLAMA_EMBED_MODEL

logger = logging.getLogger(__name__)


async def generate_embedding(text: str) -> list[float]:
    """Generiert Embedding-Vektor via nomic-embed-text auf Ollama."""
    base_url = await get_ollama_url()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{base_url}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text[:2000]},
        )
        if resp.status_code != 200:
            raise ConnectionError(
                f"Embedding fehlgeschlagen: {resp.status_code} auf {base_url}"
            )
        return resp.json()["embedding"]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Kosinus-Aehnlichkeit zwischen zwei Vektoren (0.0 bis 1.0)."""
    va, vb = np.array(a), np.array(b)
    norm_a, norm_b = np.linalg.norm(va), np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))
