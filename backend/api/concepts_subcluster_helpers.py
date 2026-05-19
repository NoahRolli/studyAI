# Concepts Subcluster Helpers v3 — Embedding-First Pipeline
#
# v3-Aenderungen vs v2:
# - Hierarchical Clustering macht das echte Clustering (numpy)
# - LLM macht NUR Label-Vergabe pro Mikro-Cluster
# - Batch-5-Cluster pro LLM-Call (spart Round-Trips)
# - Coverage mathematisch garantiert (nicht LLM-abhaengig)

import asyncio
import json
import logging

from sqlalchemy.orm import Session
from backend.models.concept import (
    Concept, ConceptCluster, ConceptClusterMember,
)

logger = logging.getLogger(__name__)

# Label-Generation: wieviele Mikro-Cluster pro LLM-Call
CLUSTERS_PER_LABEL_CALL = 5
# Max Concepts pro Cluster im Prompt (bei sehr grossen Clustern truncaten)
MAX_CONCEPTS_PER_CLUSTER_IN_PROMPT = 12


# Few-Shot Beispiele pro Parent-Cluster — gleiches Dict wie v2,
# jetzt wird's aber pro Mikro-Cluster eingesetzt nicht Batch
FEWSHOT_LABELS = {
    "Pallas": [
        "Docker Containerization", "TipTap Rich-Text Editor",
        "SQLite WAL Mode", "Three.js Sphere Rendering",
        "FastAPI Routing", "Tailwind v4 Styling",
    ],
    "Computer Vision": [
        "Edge Detection", "Convolutional Layers",
        "RANSAC Sampling", "Feature Descriptors",
        "Stereo Vision", "Image Segmentation",
    ],
    "Knowledge Representation": [
        "OWL Ontologies", "Prolog Inference",
        "DMN Decision Tables", "RDF Triples",
        "Description Logics", "SPARQL Queries",
    ],
    "BIS": [
        "Supply Chain Management", "Retail POS Systems",
        "ERP Integration", "Customer Segmentation",
        "Inventory Forecasting", "Compliance Auditing",
    ],
    "Ethics": [
        "Privacy Frameworks", "Algorithmic Bias",
        "Informed Consent", "Fairness Metrics",
        "Data Stewardship",
    ],
}


def _build_label_prompt(
    parent_label: str,
    cluster_batch: list[list[str]],
) -> str:
    """Prompt fuer Batch-Label-Vergabe: N Mikro-Cluster auf einmal.

    Jeder Mikro-Cluster bekommt 1 Label. Output: JSON-Array mit N Labels.
    """
    parent_clean = parent_label.replace(" - Other", "").strip()
    examples = FEWSHOT_LABELS.get(parent_clean, [
        "Specific Technical Topic", "Concrete Methodology",
    ])
    examples_str = ", ".join(f'"{e}"' for e in examples[:5])

    # Mikro-Cluster als nummerierte Listen darstellen
    cluster_strs = []
    for idx, concepts in enumerate(cluster_batch, 1):
        truncated = concepts[:MAX_CONCEPTS_PER_CLUSTER_IN_PROMPT]
        concept_list = ", ".join(f'"{c}"' for c in truncated)
        if len(concepts) > MAX_CONCEPTS_PER_CLUSTER_IN_PROMPT:
            concept_list += f", ... (+{len(concepts) - MAX_CONCEPTS_PER_CLUSTER_IN_PROMPT} more)"
        cluster_strs.append(f"Cluster {idx}: [{concept_list}]")
    clusters_text = "\n".join(cluster_strs)
    n = len(cluster_batch)

    return (
        f"You are labeling {n} semantically-clustered groups of concepts. "
        f"Each group already shares strong embedding similarity within "
        f"the '{parent_clean}' domain.\n\n"
        f"Your only job: give each cluster a SHORT SPECIFIC label "
        f"(2-4 words, English, noun-phrase).\n\n"
        f"GOOD label style: {examples_str}.\n"
        f"BAD labels (DO NOT USE): \"Miscellaneous\", \"Other\", \"General\", "
        f"\"Various Concepts\", \"Abstract Concepts\".\n\n"
        f"Return ONLY a JSON array of {n} strings, in cluster order. "
        f"No prose, no markdown.\n"
        f'Example output: ["Database Connection Pooling", '
        f'"React State Hooks", "WebSocket Handlers"]\n\n'
        f"Groups to label:\n{clusters_text}"
    )


def _parse_labels_response(raw: str, expected_count: int) -> list[str] | None:
    """Parsed LLM-Output zu Liste von Labels.

    Robust gegen:
    - Markdown-Fences
    - Pre/Postamble-Text
    - Zu kurze/lange Arrays
    """
    from backend.api.concepts_ai import parse_json_response
    parsed = parse_json_response(raw)
    if not isinstance(parsed, list):
        return None
    labels = []
    for item in parsed:
        if isinstance(item, str):
            cleaned = item.strip().strip('"').strip("'")[:80]
            labels.append(cleaned)
        else:
            labels.append(str(item)[:80])
    if len(labels) < expected_count:
        # Pad mit Fallback-Labels
        labels.extend([f"Concept Group {i}" for i in range(
            len(labels) + 1, expected_count + 1
        )])
    return labels[:expected_count]


async def label_clusters_batch(
    parent_label: str,
    cluster_batch: list[list[str]],
) -> list[str]:
    """Holt Labels fuer N Mikro-Cluster mit einem LLM-Call.

    Returns:
        Liste von Labels, gleiche Laenge wie cluster_batch.
        Bei LLM-Fehler: Fallback-Labels "Concept Group N".
    """
    from backend.api.concepts_ai import ai_chat_with_provider

    if not cluster_batch:
        return []

    prompt = _build_label_prompt(parent_label, cluster_batch)
    n = len(cluster_batch)
    try:
        raw, _ = await ai_chat_with_provider(
            prompt, page="metis", disable_groq=True,
        )
        labels = _parse_labels_response(raw, n)
        if labels:
            return labels
    except Exception as e:
        logger.warning(f"Label-Batch failed: {e}")

    return [f"Concept Group {i}" for i in range(1, n + 1)]


async def label_all_microclusters(
    parent_label: str,
    micro_clusters: list[list[str]],
    concurrency: int = 2,
) -> list[str]:
    """Vergibt Labels fuer alle Mikro-Cluster, parallel mit Semaphore.

    Args:
        parent_label: z.B. "Pallas - Other"
        micro_clusters: Liste von Concept-Namen-Listen
        concurrency: max parallele LLM-Calls

    Returns:
        Liste von Labels, gleiche Laenge wie micro_clusters.
    """
    if not micro_clusters:
        return []

    # In Batches splitten
    batches = [
        micro_clusters[i:i + CLUSTERS_PER_LABEL_CALL]
        for i in range(0, len(micro_clusters), CLUSTERS_PER_LABEL_CALL)
    ]

    sem = asyncio.Semaphore(concurrency)

    async def process_batch(batch):
        async with sem:
            return await label_clusters_batch(parent_label, batch)

    tasks = [asyncio.create_task(process_batch(b)) for b in batches]
    results = await asyncio.gather(*tasks)

    # Flatten + Disambiguate: doppelte Labels mit Suffix " (2)", " (3)"
    all_labels = [lbl for batch_labels in results for lbl in batch_labels]
    seen = {}
    unique_labels = []
    for lbl in all_labels:
        norm = lbl.lower()
        if norm in seen:
            seen[norm] += 1
            unique_labels.append(f"{lbl} ({seen[norm]})")
        else:
            seen[norm] = 1
            unique_labels.append(lbl)

    return unique_labels


# ============================================
# Unassigned-Redistribution (unveraendert v1/v2)
# ============================================


def _parse_embedding(raw: str | None) -> list[float] | None:
    """Embedding-JSON-String parsen."""
    if not raw:
        return None
    try:
        vec = json.loads(raw)
        if isinstance(vec, list) and all(isinstance(x, (int, float)) for x in vec):
            return [float(x) for x in vec]
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine-Aehnlichkeit."""
    import math
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _redistribute_unassigned(
    db: Session,
    unassigned_cluster_id: int,
    target_clusters: list[tuple[int, list[float]]],
) -> dict[int, list[int]]:
    """Nearest-Neighbor-Verteilung fuer Unassigned-Concepts."""
    members = db.query(ConceptClusterMember).filter_by(
        cluster_id=unassigned_cluster_id
    ).all()
    assignments: dict[int, list[int]] = {}
    skipped = 0
    if not target_clusters:
        return assignments
    for member in members:
        concept = db.query(Concept).filter_by(id=member.concept_id).first()
        if concept is None:
            skipped += 1
            continue
        vec = _parse_embedding(concept.embedding)
        if vec is None:
            skipped += 1
            continue
        best_id = None
        best_sim = -1.0
        for cid, centroid in target_clusters:
            sim = _cosine_similarity(vec, centroid)
            if sim > best_sim:
                best_sim = sim
                best_id = cid
        if best_id is not None:
            assignments.setdefault(best_id, []).append(concept.id)
    logger.info(
        f"Unassigned redistribution: "
        f"{sum(len(v) for v in assignments.values())} assigned, "
        f"{skipped} skipped"
    )
    return assignments


def _load_regular_centroids(
    db: Session,
    misc_cluster_ids: set[int],
) -> list[tuple[int, list[float]]]:
    """Laedt Centroids aller regulaeren Cluster (Misc ausgeschlossen)."""
    clusters = db.query(ConceptCluster).filter(
        ~ConceptCluster.id.in_(misc_cluster_ids)
    ).all()
    result = []
    for cluster in clusters:
        vec = _parse_embedding(cluster.centroid_text)
        if vec is not None:
            result.append((cluster.id, vec))
    return result
