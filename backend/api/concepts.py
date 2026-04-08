# Konzept-Graph CRUD API — Lesen, Editieren, Mergen, Löschen
# Endpunkte für Graph-View, Liste, Detail und Edge-Management

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource, ConceptEdge
from backend.models.note import Note
from backend.models.summary import Summary

router = APIRouter(prefix="/api/concepts", tags=["concepts"])


# --- Pydantic Schemas ---

class ConceptUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

class MergeRequest(BaseModel):
    source_id: int
    target_id: int

class EdgeUpdate(BaseModel):
    relation_type: str | None = None
    strength: float | None = None
    confirmed: bool | None = None


# --- Hilfs-Funktionen ---

def _concept_to_dict(concept: Concept, source_count: int = 0) -> dict:
    """Konzept als Dict für API-Response."""
    return {
        "id": concept.id,
        "name": concept.name,
        "description": concept.description,
        "source_count": source_count,
        "created_at": concept.created_at.isoformat() if concept.created_at else None
    }


def _resolve_source(db: Session, source_type: str, source_id: int) -> dict:
    """Quell-Dokument auflösen (Name + Typ)."""
    if source_type == "note":
        note = db.query(Note).filter(Note.id == source_id).first()
        return {"type": "note", "id": source_id,
                "title": note.title if note else "Gelöscht"}
    elif source_type == "summary":
        summary = db.query(Summary).filter(Summary.id == source_id).first()
        return {"type": "summary", "id": source_id,
                "title": summary.title if summary else "Gelöscht"}
    return {"type": source_type, "id": source_id, "title": "Unbekannt"}


# --- Endpunkte ---

@router.get("")
def list_concepts(db: Session = Depends(get_db)):
    """Alle Konzepte mit Quellen-Anzahl (für Liste-View)."""
    results = db.query(
        Concept,
        func.count(ConceptSource.id).label("source_count")
    ).outerjoin(ConceptSource).group_by(Concept.id).all()

    return [_concept_to_dict(c, sc) for c, sc in results]


@router.get("/graph")
def get_concept_graph(db: Session = Depends(get_db)):
    """Kompletter Graph: Konzepte + Edges (für Sphäre)."""
    # Konzepte mit Quellen-Anzahl
    concepts = db.query(
        Concept,
        func.count(ConceptSource.id).label("source_count")
    ).outerjoin(ConceptSource).group_by(Concept.id).all()

    nodes = [_concept_to_dict(c, sc) for c, sc in concepts]

    # Edges (nur bestätigte oder pending, nicht abgelehnte)
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.confirmed != False
    ).all()

    edge_list = [{
        "id": e.id,
        "source": e.source_concept_id,
        "target": e.target_concept_id,
        "relation_type": e.relation_type,
        "strength": e.strength,
        "ai_generated": e.ai_generated,
        "confirmed": e.confirmed
    } for e in edges]

    return {"nodes": nodes, "edges": edge_list}


@router.get("/{concept_id}")
def get_concept_detail(concept_id: int, db: Session = Depends(get_db)):
    """Detail: Konzept + verknüpfte Quellen + verwandte Konzepte."""
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Konzept nicht gefunden")

    # Quellen auflösen
    sources = db.query(ConceptSource).filter(
        ConceptSource.concept_id == concept_id
    ).all()
    resolved = [
        {**_resolve_source(db, s.source_type, s.source_id),
         "relevance": s.relevance}
        for s in sources
    ]

    # Verwandte Konzepte (über Edges)
    edges_out = db.query(ConceptEdge).filter(
        ConceptEdge.source_concept_id == concept_id,
        ConceptEdge.confirmed != False
    ).all()
    edges_in = db.query(ConceptEdge).filter(
        ConceptEdge.target_concept_id == concept_id,
        ConceptEdge.confirmed != False
    ).all()

    related = []
    for e in edges_out:
        c = db.query(Concept).filter(Concept.id == e.target_concept_id).first()
        if c:
            related.append({"id": c.id, "name": c.name,
                            "relation": e.relation_type, "direction": "out"})
    for e in edges_in:
        c = db.query(Concept).filter(Concept.id == e.source_concept_id).first()
        if c:
            related.append({"id": c.id, "name": c.name,
                            "relation": e.relation_type, "direction": "in"})

    return {
        **_concept_to_dict(concept, len(sources)),
        "sources": resolved,
        "related": related
    }


@router.put("/{concept_id}")
def update_concept(concept_id: int, data: ConceptUpdate,
                   db: Session = Depends(get_db)):
    """Konzept-Name oder Description editieren."""
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Konzept nicht gefunden")
    if data.name is not None:
        normalized = data.name.strip().lower()
        # Duplikat-Check
        existing = db.query(Concept).filter(
            Concept.name == normalized, Concept.id != concept_id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Name existiert bereits")
        concept.name = normalized
        concept.embedding_stale = True
    if data.description is not None:
        concept.description = data.description
    db.commit()
    return {"ok": True}


@router.delete("/{concept_id}")
def delete_concept(concept_id: int, db: Session = Depends(get_db)):
    """Konzept löschen (CASCADE löscht Sources + Edges mit)."""
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Konzept nicht gefunden")
    db.delete(concept)
    db.commit()
    return {"ok": True}


@router.post("/merge")
def merge_concepts(data: MergeRequest, db: Session = Depends(get_db)):
    """Zwei Konzepte zusammenführen. Target bleibt, Source wird gelöscht."""
    source = db.query(Concept).filter(Concept.id == data.source_id).first()
    target = db.query(Concept).filter(Concept.id == data.target_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Konzept nicht gefunden")

    # Alle Source-Links von source → target umhängen
    for cs in source.sources:
        existing = db.query(ConceptSource).filter(
            ConceptSource.concept_id == target.id,
            ConceptSource.source_type == cs.source_type,
            ConceptSource.source_id == cs.source_id
        ).first()
        if not existing:
            cs.concept_id = target.id
        else:
            db.delete(cs)

    # Edges umhängen (source_concept_id → target)
    for edge in source.edges_out:
        if edge.target_concept_id != target.id:
            edge.source_concept_id = target.id
        else:
            db.delete(edge)
    for edge in source.edges_in:
        if edge.source_concept_id != target.id:
            edge.target_concept_id = target.id
        else:
            db.delete(edge)

    db.delete(source)
    db.commit()
    return {"ok": True, "merged_into": target.id}


@router.put("/edges/{edge_id}")
def update_edge(edge_id: int, data: EdgeUpdate,
                db: Session = Depends(get_db)):
    """Edge bestätigen/ablehnen/editieren."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge nicht gefunden")
    if data.relation_type is not None:
        edge.relation_type = data.relation_type
    if data.strength is not None:
        edge.strength = data.strength
    if data.confirmed is not None:
        edge.confirmed = data.confirmed
    db.commit()
    return {"ok": True}
