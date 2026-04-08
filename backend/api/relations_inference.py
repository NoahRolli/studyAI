# Relations Inference — Transitive Ableitung von Wissensrelationen
# Berechnet implizite Relationen aus bestätigten concept_edges (live)
# Inspiriert von Prolog: teurer(X,Y) :- teurer(X,Z), teurer(Z,Y)
# Transitive Typen: builds_on, part_of, is_a, subclass_of, requires

from collections import deque
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge
from backend.models.relation import RelationType

router = APIRouter(prefix="/api/relations", tags=["relations-inference"])

# Typen die transitiv sind (A→B, B→C ⟹ A→C)
TRANSITIVE_TYPES = {"builds_on", "part_of", "is_a", "subclass_of", "requires"}


def _chain_length(edges: dict, start: int, end: int) -> int:
    """Kürzeste Kette von start nach end (BFS)"""
    queue = deque([(start, 0)])
    visited = {start}
    while queue:
        node, dist = queue.popleft()
        for nxt in edges.get(node, []):
            if nxt == end:
                return dist + 1
            if nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, dist + 1))
    return 0


def _compute_transitive(typed_edges: list[ConceptEdge],
                        type_name: str) -> list[dict]:
    """Transitive Hülle für einen Relationstyp berechnen."""
    direct = set()
    edges: dict[int, list[int]] = {}
    for e in typed_edges:
        direct.add((e.source_concept_id, e.target_concept_id))
        edges.setdefault(e.source_concept_id, []).append(
            e.target_concept_id
        )

    inferred = []
    for start in edges:
        visited = set()
        stack = list(edges.get(start, []))
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            if (start, current) not in direct:
                inferred.append({
                    "source_id": start,
                    "target_id": current,
                    "relation_type": type_name,
                    "chain_length": _chain_length(edges, start, current),
                })
            for nxt in edges.get(current, []):
                if nxt not in visited:
                    stack.append(nxt)
    return inferred


@router.get("/inferred")
def get_inferred_relations(db: Session = Depends(get_db)):
    """Transitive Relationen live berechnen (nicht in DB)"""
    confirmed = db.query(ConceptEdge).filter(
        ConceptEdge.status == "confirmed"
    ).all()

    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    type_labels = {
        t.name: {"label_de": t.label_de, "label_en": t.label_en}
        for t in db.query(RelationType).all()
    }
    concept_map = {c.id: c.name for c in db.query(Concept).all()}

    all_inferred = []
    for trans_type in TRANSITIVE_TYPES:
        typed = [
            e for e in confirmed
            if type_map.get(e.relation_type_id) == trans_type
        ]
        if len(typed) < 2:
            continue
        all_inferred.extend(_compute_transitive(typed, trans_type))

    return [{
        "source_type": "concept",
        "source_id": inf["source_id"],
        "source_title": concept_map.get(inf["source_id"], "?"),
        "target_type": "concept",
        "target_id": inf["target_id"],
        "target_title": concept_map.get(inf["target_id"], "?"),
        "relation_type": inf["relation_type"],
        "labels": type_labels.get(inf["relation_type"], {}),
        "chain_length": inf["chain_length"],
        "status": "inferred",
    } for inf in all_inferred]
