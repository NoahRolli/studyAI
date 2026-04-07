# Relations Inference — Transitive Ableitung von Wissensrelationen
# Berechnet implizite Relationen aus bestätigten Tripeln (live, nicht in DB)
# Inspiriert von Prolog-Rekursion: teurer(X,Y) :- teurer(X,Z), teurer(Z,Y)
# Transitive Typen: builds_on, part_of, is_a, subclass_of, requires

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.relation import Relation, RelationType
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module

router = APIRouter(prefix="/api/relations", tags=["relations-inference"])

# Typen die transitiv sind (A→B, B→C ⟹ A→C)
TRANSITIVE_TYPES = {"builds_on", "part_of", "is_a", "subclass_of", "requires"}


def _build_title_cache(db: Session) -> dict:
    """Titel-Cache für alle Node-Typen"""
    cache = {}
    for n in db.query(Note).all():
        cache[f"note:{n.id}"] = n.title
    for s in db.query(Summary).all():
        doc = db.query(Document).filter(Document.id == s.document_id).first()
        cache[f"summary:{s.id}"] = doc.filename if doc else f"Summary {s.id}"
    for m in db.query(Module).all():
        cache[f"module:{m.id}"] = m.name
    return cache


def _compute_transitive(relations: list[Relation], type_name: str) -> list[dict]:
    """Transitive Hülle für einen Relationstyp berechnen.
    Gibt neue (source, target) Paare zurück die nicht direkt existieren."""
    # Direkte Kanten als Set: (source_key, target_key)
    direct = set()
    edges = {}  # source_key → [target_key, ...]
    for r in relations:
        src = f"{r.source_type}:{r.source_id}"
        tgt = f"{r.target_type}:{r.target_id}"
        direct.add((src, tgt))
        edges.setdefault(src, []).append(tgt)

    # BFS/DFS pro Startknoten — alle erreichbaren Ziele finden
    inferred = []
    for start in edges:
        visited = set()
        stack = list(edges.get(start, []))
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            # Wenn nicht direkt verbunden → abgeleitet
            if (start, current) not in direct:
                s_type, s_id = start.split(":")
                t_type, t_id = current.split(":")
                inferred.append({
                    "source_type": s_type, "source_id": int(s_id),
                    "target_type": t_type, "target_id": int(t_id),
                    "relation_type": type_name,
                    "chain_length": _chain_length(edges, start, current),
                })
            # Weiter traversieren
            for nxt in edges.get(current, []):
                if nxt not in visited:
                    stack.append(nxt)
    return inferred


def _chain_length(edges: dict, start: str, end: str) -> int:
    """Kürzeste Kette von start nach end (BFS)"""
    from collections import deque
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


@router.get("/inferred")
def get_inferred_relations(db: Session = Depends(get_db)):
    """Transitive Relationen live berechnen (nicht in DB gespeichert)"""
    # Alle bestätigten Relationen laden
    confirmed = db.query(Relation).filter(Relation.status == "confirmed").all()

    # Typ-Map aufbauen
    type_map = {t.id: t.name for t in db.query(RelationType).all()}
    type_labels = {
        t.name: {"label_de": t.label_de, "label_en": t.label_en}
        for t in db.query(RelationType).all()
    }

    # Pro transitivem Typ die Hülle berechnen
    all_inferred = []
    for trans_type in TRANSITIVE_TYPES:
        # Relationen dieses Typs filtern
        typed_rels = [
            r for r in confirmed
            if type_map.get(r.relation_type_id) == trans_type
        ]
        if len(typed_rels) < 2:
            continue
        inferred = _compute_transitive(typed_rels, trans_type)
        all_inferred.extend(inferred)

    # Titel-Cache für Anzeige
    title_cache = _build_title_cache(db)

    # Serialisieren
    return [
        {
            "source_type": inf["source_type"],
            "source_id": inf["source_id"],
            "source_title": title_cache.get(
                f"{inf['source_type']}:{inf['source_id']}",
                f"{inf['source_type']} #{inf['source_id']}",
            ),
            "target_type": inf["target_type"],
            "target_id": inf["target_id"],
            "target_title": title_cache.get(
                f"{inf['target_type']}:{inf['target_id']}",
                f"{inf['target_type']} #{inf['target_id']}",
            ),
            "relation_type": inf["relation_type"],
            "labels": type_labels.get(inf["relation_type"], {}),
            "chain_length": inf["chain_length"],
            "status": "inferred",
        }
        for inf in all_inferred
    ]
