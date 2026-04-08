# Konzept-Cluster AI — Thematische Gruppierung via Ollama
# Schickt Konzepte batchweise, Ollama gruppiert thematisch.

import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptCluster, ConceptClusterMember
from backend.api.concepts_ai import _ollama_chat, _parse_json_response

router = APIRouter(prefix="/api/concepts", tags=["concepts-cluster"])


@router.post("/auto-cluster")
async def auto_cluster_concepts(db: Session = Depends(get_db)):
    """Ollama gruppiert Konzepte thematisch in Cluster."""
    concepts = db.query(Concept).all()
    if len(concepts) < 3:
        return {"clusters": 0}

    # Alte Cluster löschen (frischer Durchlauf)
    db.query(ConceptClusterMember).delete()
    db.query(ConceptCluster).delete()
    db.flush()

    names = [c.name for c in concepts]
    name_to_id = {c.name: c.id for c in concepts}
    all_clusters: dict[str, list[str]] = {}

    # In 40er-Batches an Ollama schicken
    for i in range(0, len(names), 40):
        batch = names[i:i+40]
        if len(batch) < 2:
            continue
        prompt = (
            "Group these concepts into thematic clusters. "
            "Each cluster should have a short label and a list of concepts. "
            "Return ONLY a JSON array of objects with "
            "'label' and 'members' fields. "
            "Example: [{\"label\": \"Ethics\", \"members\": [\"autonomy\", \"privacy\"]}]\n\n"
            f"Concepts: {json.dumps(batch)}"
        )
        response = await _ollama_chat(prompt)
        parsed = _parse_json_response(response)
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            members = item.get("members", [])
            if not label or not isinstance(members, list):
                continue
            # Cluster zusammenführen wenn gleiches Label
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
                concept_id=name_to_id[name]
            ))
        count += 1

    db.commit()
    return {"clusters": count, "batches": (len(names) + 39) // 40}
