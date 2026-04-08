# Metis API — Knowledge-Graph Endpunkte (Legacy-Wrapper)
# Graph + Nodes zeigen jetzt Konzepte (via /api/concepts/graph)
# Edge-Endpoints sind Wrapper auf concept_edges für Abwärtskompatibilität
# MetisNodes existieren noch in DB, werden aber nicht mehr aktiv genutzt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource, ConceptEdge
from backend.models.relation import RelationType
from backend.models.metis_node import MetisNode
from backend.models.metis_cluster import MetisCluster, MetisClusterMember
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document

router = APIRouter(prefix="/api/metis", tags=["metis"])


# --- Pydantic Schemas ---

class EdgeCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    relation_type: str = "related"

class EdgeUpdate(BaseModel):
    relation_type: Optional[str] = None
    reason: Optional[str] = None


# --- Mapping: relation_type String → relation_type_id ---

RELATION_TYPE_MAP = {
    "related": 8, "related_to": 8,
    "builds_on": 4, "contradicts": 6,
    "part_of": 3, "is_a": 1,
    "subclass_of": 2, "requires": 5, "example_of": 7,
    "wikilink": 8, "similarity": 8,
}


def _edge_to_dict(e: ConceptEdge, type_map: dict) -> dict:
    """ConceptEdge als Metis-kompatibles Dict"""
    rt = type_map.get(e.relation_type_id)
    return {
        "id": e.id,
        "source_node_id": e.source_concept_id,
        "target_node_id": e.target_concept_id,
        "relation_type": rt.name if rt else "related_to",
        "strength": e.strength,
        "status": e.status,
        "reason": e.reason,
        "reviewed_at": e.reviewed_at.isoformat() if e.reviewed_at else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# --- Graph (Konzept-basiert) ---

@router.get("/graph")
def get_graph(db: Session = Depends(get_db)):
    """Graph aus Konzepten + concept_edges (Legacy-kompatibel)."""
    from sqlalchemy import func
    concepts = db.query(Concept).all()
    type_map = {t.id: t for t in db.query(RelationType).all()}

    # Nodes aus Konzepten bauen (Metis-Node-Format)
    nodes = []
    for c in concepts:
        src_count = db.query(ConceptSource).filter(
            ConceptSource.concept_id == c.id
        ).count()
        nodes.append({
            "id": c.id, "title": c.name,
            "source_type": "concept", "source_id": c.id,
            "x": None, "y": None, "z": None,
            "source_count": src_count,
        })

    # Edges (nicht abgelehnte)
    edges = db.query(ConceptEdge).filter(
        ConceptEdge.status != "rejected"
    ).all()
    edge_list = [_edge_to_dict(e, type_map) for e in edges]

    # Cluster
    clusters = db.query(MetisCluster).all()
    cluster_list = [{
        "id": cl.id, "label": cl.label,
        "description": cl.description,
        "node_ids": [m.node_id for m in cl.members],
    } for cl in clusters]

    return {"nodes": nodes, "edges": edge_list, "clusters": cluster_list}


# --- Edge CRUD (Wrapper auf concept_edges) ---

@router.get("/edges")
def get_edges(status: Optional[str] = None,
              db: Session = Depends(get_db)):
    """Alle Edges, optional nach Status gefiltert."""
    q = db.query(ConceptEdge)
    if status:
        q = q.filter(ConceptEdge.status == status)
    type_map = {t.id: t for t in db.query(RelationType).all()}
    return [_edge_to_dict(e, type_map) for e in q.all()]


@router.post("/edges")
def create_edge(data: EdgeCreate, db: Session = Depends(get_db)):
    """Edge erstellen (Legacy-Signatur mit node_ids)."""
    if data.source_node_id == data.target_node_id:
        raise HTTPException(400, "Selbst-Referenz nicht erlaubt")
    existing = db.query(ConceptEdge).filter(
        ConceptEdge.source_concept_id == data.source_node_id,
        ConceptEdge.target_concept_id == data.target_node_id,
    ).first()
    if existing:
        raise HTTPException(409, "Edge existiert bereits")
    rel_id = RELATION_TYPE_MAP.get(data.relation_type, 8)
    edge = ConceptEdge(
        source_concept_id=data.source_node_id,
        target_concept_id=data.target_node_id,
        relation_type_id=rel_id, strength=1.0,
        origin="manual", status="confirmed",
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(edge)
    db.commit()
    type_map = {t.id: t for t in db.query(RelationType).all()}
    return _edge_to_dict(edge, type_map)


@router.put("/edges/{edge_id}")
def update_edge(edge_id: int, data: EdgeUpdate,
                db: Session = Depends(get_db)):
    """Edge bearbeiten."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(404, "Edge nicht gefunden")
    if data.relation_type is not None:
        edge.relation_type_id = RELATION_TYPE_MAP.get(data.relation_type, 8)
    if data.reason is not None:
        edge.reason = data.reason
    db.commit()
    type_map = {t.id: t for t in db.query(RelationType).all()}
    return _edge_to_dict(edge, type_map)


@router.put("/edges/{edge_id}/confirm")
def confirm_edge(edge_id: int, db: Session = Depends(get_db)):
    """Edge bestätigen."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(404, "Edge nicht gefunden")
    edge.status = "confirmed"
    edge.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"confirmed": True}


@router.put("/edges/{edge_id}/reject")
def reject_edge(edge_id: int, db: Session = Depends(get_db)):
    """Edge ablehnen."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(404, "Edge nicht gefunden")
    edge.status = "rejected"
    edge.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"rejected": True}


@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: int, db: Session = Depends(get_db)):
    """Edge löschen."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(404, "Edge nicht gefunden")
    db.delete(edge)
    db.commit()
    return {"deleted": True}


# --- Sync (Legacy, leitet auf Concept-Sync um) ---

@router.post("/sync")
def sync_graph(db: Session = Depends(get_db)):
    """Legacy Sync — weiterleiten auf Concept-System."""
    return {"message": "Use /api/concepts/sync instead", "ok": True}
