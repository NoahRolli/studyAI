# Konzept-Cluster Helpers — Ordner-Seed Batching fuer Auto-Cluster-Stream
#
# Dieses Modul stellt Helper-Funktionen fuer concepts_cluster_stream.py
# bereit. Der frueher hier vorhandene synchrone POST /auto-cluster Endpoint
# wurde in Chat 66 entfernt — der Stream-Endpoint hat ihn vollstaendig
# abgeloest (Cancel-Support, disable_groq, Forward-Progress, Live-Progress
# via SSE, Connector-Cooldown).
#
# Helpers:
# - _build_concept_folder_map: Konzept → primaerer Ordner (via Sources)
# - _build_folder_batches:    Konzepte nach Ordner gruppieren, 40er-Batches

from collections import Counter, defaultdict
from fastapi import APIRouter
from sqlalchemy.orm import Session
from backend.models.concept import Concept, ConceptSource
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module
from backend.models.folder import Folder

# Router bleibt fuer ev. zukuenftige Concept-Cluster-Endpoints (z.B. Stats,
# Cluster-Cleanup, Cluster-Merge). Aktuell leer — Auto-Cluster laeuft via
# concepts_cluster_stream.py (GET /auto-cluster/stream).
router = APIRouter(prefix="/api/concepts", tags=["concepts-cluster"])


def _build_concept_folder_map(db: Session) -> dict[int, int | None]:
    """Ordnet jedem Konzept seinen primaeren Ordner zu (via Sources).
    Pfad: ConceptSource(summary) → Summary → Document → Folder.
    Notes haben keinen Ordner → None.

    Plurality-Voting: ein Concept kann Summary-Sources aus mehreren
    Folders haben. Der Folder mit den meisten Sources gewinnt. Bei
    Gleichstand entscheidet die kleinste Folder-ID (deterministisch).
    """
    # Summary-ID → Folder-ID Mapping
    sum_folder: dict[int, int] = {}
    rows = db.query(
        Summary.id, Document.folder_id, Module.folder_id
    ).join(
        Document, Summary.document_id == Document.id
    ).outerjoin(
        Module, Document.module_id == Module.id
    ).all()
    for sum_id, doc_folder, mod_folder in rows:
        fid = doc_folder or mod_folder
        if fid:
            sum_folder[sum_id] = fid

    # Konzept → Counter(Folder-IDs) aus allen Summary-Sources sammeln
    sources = db.query(ConceptSource).filter(
        ConceptSource.source_type == "summary"
    ).all()
    concept_folder_votes: dict[int, Counter] = defaultdict(Counter)
    for s in sources:
        fid = sum_folder.get(s.source_id)
        if fid:
            concept_folder_votes[s.concept_id][fid] += 1

    # Plurality: haeufigster Folder pro Concept gewinnt. Tie-Break:
    # kleinste Folder-ID (Counter.most_common(1) ist insertion-stable,
    # daher sortieren wir die Items explizit).
    concept_folder: dict[int, int | None] = {}
    for cid, votes in concept_folder_votes.items():
        # Sortieren: erst nach -count, dann nach fid (aufsteigend)
        best_fid, _ = sorted(
            votes.items(), key=lambda kv: (-kv[1], kv[0])
        )[0]
        concept_folder[cid] = best_fid

    return concept_folder


def _build_folder_batches(
    concepts: list[Concept],
    concept_folder: dict[int, int | None],
    db: Session,
) -> list[tuple[str, list[str]]]:
    """Gruppiert Konzepte nach Ordner fuer Seed-Batching.
    Gibt Liste von (folder_hint, [concept_names]) zurueck."""
    folder_groups: dict[int, list[str]] = defaultdict(list)
    no_folder: list[str] = []

    for c in concepts:
        fid = concept_folder.get(c.id)
        if fid:
            folder_groups[fid].append(c.name)
        else:
            no_folder.append(c.name)

    # Ordner-Labels holen
    folder_labels: dict[int, str] = {}
    if folder_groups:
        folders = db.query(Folder).filter(
            Folder.id.in_(folder_groups.keys())
        ).all()
        folder_labels = {f.id: f.name for f in folders}

    batches: list[tuple[str, list[str]]] = []
    for fid, names in folder_groups.items():
        label = folder_labels.get(fid, "")
        # Grosse Ordner in 40er-Batches splitten
        for i in range(0, len(names), 40):
            batches.append((label, names[i:i+40]))

    # Ordnerlose Konzepte in 40er-Batches
    for i in range(0, len(no_folder), 40):
        batches.append(("", no_folder[i:i+40]))

    return batches
