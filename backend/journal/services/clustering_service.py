# Clustering Service — Themen-Clustering für Journal-Einträge
# Gruppiert Einträge nach thematischer Ähnlichkeit via Embeddings
# Nutzt einfaches Schwellwert-Clustering (kein scikit-learn nötig)
#
# Flow: Embeddings laden → Ähnlichkeitsmatrix → Cluster bilden
# Cluster-Labels werden via Ollama generiert

import numpy as np
from backend.journal.services.embedding_service import cosine_similarity
from backend.journal.services.journal_ai_service import journal_ai


def cluster_entries(
    entries: list[dict],
    threshold: float = 0.65,
) -> list[dict]:
    """
    Gruppiert Einträge nach thematischer Ähnlichkeit.
    Einfaches Single-Link Clustering ohne externe Libraries.
    
    entries: Liste von {"id": int, "title": str, "embedding": list[float]}
    threshold: Mindest-Ähnlichkeit für gleichen Cluster (0.0-1.0)
    
    Gibt zurück: Liste von Clustern mit Entry-IDs
    [{"cluster_id": 0, "entry_ids": [1, 3, 7], "entries": [...]}]
    """
    if not entries:
        return []

    # Jeder Eintrag startet als eigener Cluster
    n = len(entries)
    cluster_ids = list(range(n))

    # Einträge mit hoher Ähnlichkeit zusammenführen
    for i in range(n):
        for j in range(i + 1, n):
            emb_i = entries[i].get("embedding")
            emb_j = entries[j].get("embedding")

            if not emb_i or not emb_j:
                continue

            similarity = cosine_similarity(emb_i, emb_j)
            if similarity >= threshold:
                # Cluster zusammenführen: alle mit j's Cluster-ID
                # bekommen i's Cluster-ID
                old_id = cluster_ids[j]
                new_id = cluster_ids[i]
                for k in range(n):
                    if cluster_ids[k] == old_id:
                        cluster_ids[k] = new_id

    # Cluster aufbauen
    clusters: dict[int, list[int]] = {}
    for idx, cid in enumerate(cluster_ids):
        if cid not in clusters:
            clusters[cid] = []
        clusters[cid].append(idx)

    # Ergebnis formatieren
    result = []
    for cluster_num, (_, indices) in enumerate(clusters.items()):
        result.append({
            "cluster_id": cluster_num,
            "entry_ids": [entries[i]["id"] for i in indices],
            "titles": [entries[i]["title"] for i in indices],
        })

    return result


async def label_cluster(titles: list[str]) -> str:
    """
    Generiert ein kurzes Label für einen Cluster via Ollama.
    Basiert auf den Titeln der enthaltenen Einträge.
    """
    if not titles:
        return "Unbenannt"

    if len(titles) == 1:
        return titles[0]

    titles_text = "\n".join(f"- {t}" for t in titles[:10])

    try:
        result = await journal_ai._chat(
            prompt=f"""Diese Tagebucheinträge gehören thematisch zusammen.
Gib dem Cluster einen kurzen Titel (maximal 4 Wörter).
Antworte NUR mit dem Titel, kein anderer Text.

Einträge:
{titles_text}""",
            max_tokens=50,
        )
        return result.strip().strip('"').strip("'")
    except Exception:
        return "Themengruppe"