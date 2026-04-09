# Konzept-Graph CRUD API — Lesen, Editieren, Mergen, Löschen
# Endpunkte für Graph-View, Liste, Detail, Edge-Management
# Edges nutzen relation_type_id (FK auf relation_types) + origin + status

from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime, timezone
from backend.models.database import get_db
from backend.models.concept import (
    Concept, ConceptSource, ConceptEdge,
    ConceptCluster, ConceptClusterMember,
)
from backend.models.relation import RelationType
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
    relation_type_id: int | None = None
    strength: float | None = None
    status: str | None = None
    reason: str | None = None

class EdgeCreate(BaseModel):
    source_concept_id: int
    target_concept_id: int
    relation_type_id: int
    strength: float = 1.0
    reason: str | None = None


# --- Hilfs-Funktionen ---

def _concept_to_dict(concept: Concept, source_count: int = 0) -> dict:
    """Konzept als Dict für API-Response."""
    return {
        "id": concept.id,
        "name": concept.name,
        "description": concept.description,
        "source_count": source_count,
        "created_at": concept.created_at.isoformat() if concept.created_at else None,
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


def _edge_to_dict(e: ConceptEdge, type_map: dict) -> dict:
    """Edge als Dict mit Typ-Info serialisieren."""
    rt = type_map.get(e.relation_type_id)
    return {
        "id": e.id,
        "source": e.source_concept_id,
        "target": e.target_concept_id,
        "relation_type": {
            "id": rt.id, "name": rt.name,
            "label_de": rt.label_de, "label_en": rt.label_en,
        } if rt else None,
        "strength": e.strength,
        "origin": e.origin,
        "status": e.status,
        "confidence": e.confidence,
        "reason": e.reason,
    }


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
    """Graph gefiltert nach metis_enabled Ordnern."""
    from backend.models.folder import Folder
    from backend.models.document import Document
    from backend.models.module import Module
    from backend.models.summary import Summary as SummaryModel

    # Sichtbare Concept-IDs: Notes immer, Summaries nur aus aktiven Ordnern
    folder_ids = {r[0] for r in db.query(Folder.id).filter(
        Folder.metis_enabled == True).all()}
    # Dokument-IDs aus aktivierten Ordnern
    doc_direct = {r[0] for r in db.query(Document.id).filter(
        Document.folder_id.in_(folder_ids)).all()} if folder_ids else set()
    doc_via_mod = {r[0] for r in db.query(Document.id).join(
        Module, Document.module_id == Module.id).filter(
        Module.folder_id.in_(folder_ids)).all()} if folder_ids else set()
    enabled_doc_ids = doc_direct | doc_via_mod
    enabled_sum_ids = {r[0] for r in db.query(SummaryModel.id).filter(
        SummaryModel.document_id.in_(enabled_doc_ids)).all()
    } if enabled_doc_ids else set()
    # Konzepte mit Note-Source oder Summary-Source in aktivem Ordner
    note_cids = {r[0] for r in db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "note").all()}
    sum_cids = {r[0] for r in db.query(ConceptSource.concept_id).filter(
        ConceptSource.source_type == "summary",
        ConceptSource.source_id.in_(enabled_sum_ids)).all()
    } if enabled_sum_ids else set()
    visible_ids = note_cids | sum_cids

    concepts = db.query(
        Concept, func.count(ConceptSource.id).label("source_count")
    ).outerjoin(ConceptSource).filter(
        Concept.id.in_(visible_ids)
    ).group_by(Concept.id).all() if visible_ids else []
    nodes = [_concept_to_dict(c, sc) for c, sc in concepts]
    node_ids = {c.id for c, _ in concepts}

    # Edges: nur zwischen sichtbaren Nodes
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected",
        ConceptEdge.source_concept_id.in_(node_ids),
        ConceptEdge.target_concept_id.in_(node_ids),
    ).all() if node_ids else []
    type_map = {t.id: t for t in db.query(RelationType).all()}
    edge_list = [_edge_to_dict(e, type_map) for e in edges]

    # Cluster: nur node_ids filtern
    clusters = db.query(ConceptCluster).all()
    cluster_list = []
    for cl in clusters:
        cids = [m.concept_id for m in cl.members if m.concept_id in node_ids]
        if cids:
            cluster_list.append({"id": cl.id, "label": cl.label,
                "description": cl.description, "node_ids": cids})

    return {"nodes": nodes, "edges": edge_list, "clusters": cluster_list}


@router.get("/{concept_id}")
def get_concept_detail(concept_id: int, db: Session = Depends(get_db)):
    """Detail: Konzept + Quellen + verwandte Konzepte."""
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Konzept nicht gefunden")

    sources = db.query(ConceptSource).filter(
        ConceptSource.concept_id == concept_id
    ).all()
    resolved = [
        {**_resolve_source(db, s.source_type, s.source_id),
         "relevance": s.relevance}
        for s in sources
    ]

    # Verwandte Konzepte (nicht abgelehnte Edges)
    type_map = {t.id: t for t in db.query(RelationType).all()}
    edges_out = db.query(ConceptEdge).filter(
        ConceptEdge.source_concept_id == concept_id,
        ConceptEdge.status != "rejected",
    ).all()
    edges_in = db.query(ConceptEdge).filter(
        ConceptEdge.target_concept_id == concept_id,
        ConceptEdge.status != "rejected",
    ).all()

    related = []
    for e in edges_out:
        c = db.query(Concept).filter(Concept.id == e.target_concept_id).first()
        rt = type_map.get(e.relation_type_id)
        if c:
            related.append({
                "id": c.id, "name": c.name, "direction": "out",
                "edge_id": e.id, "status": e.status, "origin": e.origin,
                "relation": rt.name if rt else "related_to",
                "confidence": e.confidence,
            })
    for e in edges_in:
        c = db.query(Concept).filter(Concept.id == e.source_concept_id).first()
        rt = type_map.get(e.relation_type_id)
        if c:
            related.append({
                "id": c.id, "name": c.name, "direction": "in",
                "edge_id": e.id, "status": e.status, "origin": e.origin,
                "relation": rt.name if rt else "related_to",
                "confidence": e.confidence,
            })

    return {
        **_concept_to_dict(concept, len(sources)),
        "sources": resolved, "related": related,
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

    for cs in source.sources:
        existing = db.query(ConceptSource).filter(
            ConceptSource.concept_id == target.id,
            ConceptSource.source_type == cs.source_type,
            ConceptSource.source_id == cs.source_id,
        ).first()
        if not existing:
            cs.concept_id = target.id
        else:
            db.delete(cs)

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


# --- Edge Management ---

@router.post("/edges")
def create_edge(data: EdgeCreate, db: Session = Depends(get_db)):
    """Manuell eine Edge erstellen (origin=manual, status=confirmed)."""
    if data.source_concept_id == data.target_concept_id:
        raise HTTPException(status_code=400, detail="Selbst-Referenz nicht erlaubt")
    existing = db.query(ConceptEdge).filter(
        ConceptEdge.source_concept_id == data.source_concept_id,
        ConceptEdge.target_concept_id == data.target_concept_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Edge existiert bereits")
    edge = ConceptEdge(
        source_concept_id=data.source_concept_id,
        target_concept_id=data.target_concept_id,
        relation_type_id=data.relation_type_id,
        strength=data.strength,
        origin="manual", status="confirmed",
        reason=data.reason,
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(edge)
    db.commit()
    return {"ok": True, "id": edge.id}


@router.put("/edges/{edge_id}")
def update_edge(edge_id: int, data: EdgeUpdate,
                db: Session = Depends(get_db)):
    """Edge bestätigen/ablehnen/editieren."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge nicht gefunden")
    if data.relation_type_id is not None:
        edge.relation_type_id = data.relation_type_id
    if data.strength is not None:
        edge.strength = data.strength
    if data.reason is not None:
        edge.reason = data.reason
    if data.status is not None:
        edge.status = data.status
        edge.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
