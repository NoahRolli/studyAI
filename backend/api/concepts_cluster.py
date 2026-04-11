# Konzept-Cluster AI — Thematische Gruppierung via aktivem Provider
# Ordner-Seed: Konzepte aus gleichem Ordner kommen in gleichen Batch
# Ordnerlose Konzepte werden am Ende in gemischten Batches geschickt

import json
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import (
    Concept, ConceptSource, ConceptCluster, ConceptClusterMember,
)
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module
from backend.models.folder import Folder
from backend.api.concepts_ai import ollama_chat, parse_json_response

router = APIRouter(prefix="/api/concepts", tags=["concepts-cluster"])


def _build_concept_folder_map(db: Session) -> dict[int, int | None]:
    """Ordnet jedem Konzept seinen primaeren Ordner zu (via Sources).
    Pfad: ConceptSource(summary) → Summary → Document → Folder.
    Notes haben keinen Ordner → None."""
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

    # Konzept → Ordner (erster Treffer aus Summary-Sources)
    sources = db.query(ConceptSource).filter(
        ConceptSource.source_type == "summary"
    ).all()
    concept_folder: dict[int, int | None] = {}
    for s in sources:
        if s.concept_id not in concept_folder and s.source_id in sum_folder:
            concept_folder[s.concept_id] = sum_folder[s.source_id]

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


@router.post("/auto-cluster")
async def auto_cluster_concepts(db: Session = Depends(get_db)):
    """AI gruppiert Konzepte thematisch — Ordner als Seed-Hint."""
    concepts = db.query(Concept).all()
    if len(concepts) < 3:
        return {"clusters": 0}

    # Alte Cluster loeschen (frischer Durchlauf)
    db.query(ConceptClusterMember).delete()
    db.query(ConceptCluster).delete()
    db.flush()

    name_to_id = {c.name: c.id for c in concepts}
    concept_folder = _build_concept_folder_map(db)
    batches = _build_folder_batches(concepts, concept_folder, db)

    all_clusters: dict[str, list[str]] = {}

    for folder_hint, batch in batches:
        if len(batch) < 2:
            continue

        # Ordner-Kontext als Hint fuer bessere Gruppierung
        folder_ctx = ""
        if folder_hint:
            folder_ctx = (
                f"These concepts come from the folder '{folder_hint}'. "
                "Use this as context for grouping, but create "
                "sub-groups if the topics differ.\n\n"
            )

        prompt = (
            "Group these concepts into thematic clusters. "
            "Each cluster should have a short descriptive label "
            "and a list of member concepts. "
            "Return ONLY a JSON array of objects with "
            "'label' and 'members' fields. "
            "Example: [{\"label\": \"Ethics\", "
            "\"members\": [\"autonomy\", \"privacy\"]}]\n\n"
            f"{folder_ctx}"
            f"Concepts: {json.dumps(batch)}"
        )
        response = await ollama_chat(prompt)
        parsed = parse_json_response(response)
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            members = item.get("members", [])
            if not label or not isinstance(members, list):
                continue
            label_lower = label.lower()
            if label_lower not in all_clusters:
                all_clusters[label_lower] = []
            for m in members:
                name = str(m).strip().lower()
                if name in name_to_id and name not in all_clusters[label_lower]:
                    all_clusters[label_lower].append(name)

    # Cluster in DB speichern
    count = 0
    for label, members in all_clusters.items():
        if len(members) < 2:
            continue
        cluster = ConceptCluster(label=label.title())
        db.add(cluster)
        db.flush()
        for name in members:
            db.add(ConceptClusterMember(
                cluster_id=cluster.id,
                concept_id=name_to_id[name],
            ))
        count += 1

    db.commit()
    return {
        "clusters": count,
        "batches": len(batches),
        "total_concepts": len(concepts),
    }
