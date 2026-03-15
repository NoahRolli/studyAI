# Embedding Service — Text-Embeddings für Journal-Einträge
# Nutzt Ollama mit nomic-embed-text (lokal, kein externer API-Call)
# Embeddings werden für Clustering und Ähnlichkeitssuche verwendet
#
# nomic-embed-text gibt 768-dimensionale Vektoren zurück
# Diese werden verschlüsselt in der Journal-DB gespeichert

import httpx
import numpy as np
from backend.journal.infra.journal_config import (
    OLLAMA_BASE_URL,
    OLLAMA_EMBED_MODEL,
)


async def generate_embedding(text: str) -> list[float]:
    """
    Generiert einen Embedding-Vektor für einen Text.
    Gibt eine Liste von 768 Floats zurück.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={
                "model": OLLAMA_EMBED_MODEL,
                "prompt": text[:2000],  # Textlänge begrenzen
            }
        )

        if response.status_code != 200:
            raise ConnectionError(
                f"Ollama Embedding fehlgeschlagen (Status {response.status_code}). "
                f"Ist {OLLAMA_EMBED_MODEL} installiert? ollama pull {OLLAMA_EMBED_MODEL}"
            )

        return response.json()["embedding"]


async def generate_entry_embedding(title: str, content: str) -> list[float]:
    """
    Generiert ein Embedding für einen Journal-Eintrag.
    Kombiniert Titel und Inhalt für besseren Kontext.
    """
    combined = f"{title}\n\n{content}"
    return await generate_embedding(combined)


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Berechnet die Kosinus-Ähnlichkeit zwischen zwei Vektoren.
    Gibt einen Wert zwischen -1.0 und 1.0 zurück.
    1.0 = identisch, 0.0 = unrelated, -1.0 = gegensätzlich
    """
    a = np.array(vec_a)
    b = np.array(vec_b)

    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot_product / (norm_a * norm_b))


def find_similar_entries(
    target_embedding: list[float],
    entries: list[dict],
    threshold: float = 0.7,
    max_results: int = 5,
) -> list[dict]:
    """
    Findet ähnliche Einträge basierend auf Embedding-Ähnlichkeit.
    
    entries: Liste von {"id": int, "embedding": list[float], ...}
    threshold: Mindest-Ähnlichkeit (0.0-1.0)
    
    Gibt sortierte Liste zurück mit zusätzlichem "similarity" Feld.
    """
    results = []
    for entry in entries:
        if "embedding" not in entry or not entry["embedding"]:
            continue

        similarity = cosine_similarity(target_embedding, entry["embedding"])
        if similarity >= threshold:
            results.append({**entry, "similarity": round(similarity, 4)})

    # Nach Ähnlichkeit absteigend sortieren
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:max_results]