# Relations API — Wrapper auf concept_edges (Abwärtskompatibilität)
# Ontologie-Frontend ruft /api/relations/* auf, Backend liest/schreibt concept_edges
# relation_types bleiben unverändert als eigener Router

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptSource, ConceptEdge
from backend.models.relation import RelationType
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module

router = APIRouter(prefix="/api/relations", tags=["relations"])
logger = logging.getLogger(__name__)
type_router = APIRouter(prefix="/api/relation-types", tags=["relations"])

# Built-in Typen (automatisch angelegt)
BUILTIN_TYPES = [
    ("is_a", "ist ein(e)", "is a", "Instanz einer Klasse"),
    ("subclass_of", "Unterklasse von", "subclass of", "Hierarchische Vererbung"),
    ("part_of", "Teil von", "part of", "Komposition / Bestandteil"),
    ("builds_on", "baut auf", "builds on", "Aufbauendes Wissen"),
    ("requires", "setzt voraus", "requires", "Voraussetzung / Abhängigkeit"),
    ("contradicts", "widerspricht", "contradicts", "Widerspruch / Gegensatz"),
    ("example_of", "Beispiel für", "example of", "Konkrete Instanz eines Konzepts"),
    ("related_to", "verwandt mit", "related to", "Generische Verbindung"),
]


def _ensure_builtin_types(db: Session):
    """Erstellt Built-in Typen falls nicht vorhanden"""
    existing = {t.name for t in db.query(RelationType.name).all()}
    for name, de, en, desc in BUILTIN_TYPES:
        if name not in existing:
            db.add(RelationType(
                name=name, label_de=de, label_en=en,
                description=desc, is_builtin=True,
            ))
    db.commit()


# --- Pydantic Schemas (gleiche Signatur wie vorher) ---

class RelationCreate(BaseModel):
    source_type: str
    source_id: int
    target_type: str
    target_id: int
    relation_type_id: int
    reason: Optional[str] = None

class RelationUpdate(BaseModel):
    relation_type_id: Optional[int] = None
    reason: Optional[str] = None


# --- Hilfs-Funktionen ---

def _build_title_cache(db: Session) -> dict:
    """Titel-Cache für Konzepte + Quell-Dokumente"""
    cache = {}
    for c in db.query(Concept).all():
        cache[f"concept:{c.id}"] = c.name
    for n in db.query(Note).all():
        cache[f"note:{n.id}"] = n.title
    for s in db.query(Summary).all():
        doc = db.query(Document).filter(Document.id == s.document_id).first()
        cache[f"summary:{s.id}"] = doc.filename if doc else f"Summary {s.id}"
    for m in db.query(Module).all():
        cache[f"module:{m.id}"] = m.name
    return cache


def _edge_to_relation(e: ConceptEdge, type_map: dict,
                      title_cache: dict) -> dict:
    """ConceptEdge als Relation-kompatibles Dict serialisieren"""
    rt = type_map.get(e.relation_type_id)
    src_name = title_cache.get(f"concept:{e.source_concept_id}",
                                f"Konzept #{e.source_concept_id}")
    tgt_name = title_cache.get(f"concept:{e.target_concept_id}",
                                f"Konzept #{e.target_concept_id}")
    return {
        "id": e.id,
        "source_type": "concept", "source_id": e.source_concept_id,
        "source_title": src_name,
        "target_type": "concept", "target_id": e.target_concept_id,
        "target_title": tgt_name,
        "relation_type": {
            "id": rt.id, "name": rt.name,
            "label_de": rt.label_de, "label_en": rt.label_en,
        } if rt else None,
        "status": e.status,
        "reason": e.reason,
        "created_by": "user" if e.origin == "manual" else "ollama",
        "origin": e.origin,
        "confidence": e.confidence,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# --- Relation CRUD (auf concept_edges) ---



@router.delete("/suggestions")
def clear_suggestions(db: Session = Depends(get_db)):
    """Alle vorgeschlagenen Edges löschen (confirmed + rejected bleiben)."""
    count = db.query(ConceptEdge).filter(
        ConceptEdge.status == "suggested"
    ).delete()
    db.commit()
    logger.info(f"{count} Suggestions gelöscht")
    return {"deleted": count}
@router.get("")
def get_relations(
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    relation_type_id: Optional[int] = None,
    origin: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Alle Edges laden, optional gefiltert"""
    _ensure_builtin_types(db)
    q = db.query(ConceptEdge)
    if origin:
        q = q.filter(ConceptEdge.origin == origin)
    if status:
        q = q.filter(ConceptEdge.status == status)
    if source_type == "concept" and source_id:
        q = q.filter(or_(
            ConceptEdge.source_concept_id == source_id,
            ConceptEdge.target_concept_id == source_id,
        ))
    if relation_type_id:
        q = q.filter(ConceptEdge.relation_type_id == relation_type_id)
    edges = q.order_by(ConceptEdge.created_at.desc()).all()
    type_map = {t.id: t for t in db.query(RelationType).all()}
    tc = _build_title_cache(db)
    return [_edge_to_relation(e, type_map, tc) for e in edges]


@router.post("")
def create_relation(data: RelationCreate, db: Session = Depends(get_db)):
    """Manuell eine Edge erstellen (origin=manual, status=confirmed)"""
    # source_type/target_type werden ignoriert — wir brauchen concept_ids
    # Frontend muss concept_ids in source_id/target_id schicken
    existing = db.query(ConceptEdge).filter(
        ConceptEdge.source_concept_id == data.source_id,
        ConceptEdge.target_concept_id == data.target_id,
    ).first()
    if existing:
        return {"error": "Edge existiert bereits"}
    edge = ConceptEdge(
        source_concept_id=data.source_id,
        target_concept_id=data.target_id,
        relation_type_id=data.relation_type_id,
        strength=1.0, origin="manual", status="confirmed",
        reason=data.reason,
        reviewed_at=datetime.now(timezone.utc),
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    type_map = {t.id: t for t in db.query(RelationType).all()}
    tc = _build_title_cache(db)
    return _edge_to_relation(edge, type_map, tc)


@router.put("/{relation_id}")
def update_relation(relation_id: int, data: RelationUpdate,
                    db: Session = Depends(get_db)):
    """Edge bearbeiten (Typ oder Begründung)"""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == relation_id).first()
    if not edge:
        return {"error": "Relation nicht gefunden"}
    if data.relation_type_id is not None:
        edge.relation_type_id = data.relation_type_id
    if data.reason is not None:
        edge.reason = data.reason
    db.commit()
    type_map = {t.id: t for t in db.query(RelationType).all()}
    tc = _build_title_cache(db)
    return _edge_to_relation(edge, type_map, tc)


@router.delete("/{relation_id}")
def delete_relation(relation_id: int, db: Session = Depends(get_db)):
    """Edge löschen"""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == relation_id).first()
    if not edge:
        return {"error": "Relation nicht gefunden"}
    db.delete(edge)
    db.commit()
    return {"deleted": True}


@router.put("/{relation_id}/confirm")
def confirm_relation(relation_id: int, db: Session = Depends(get_db)):
    """Edge bestätigen"""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == relation_id).first()
    if not edge:
        return {"error": "Relation nicht gefunden"}
    edge.status = "confirmed"
    edge.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"confirmed": True}


@router.put("/{relation_id}/reject")
def reject_relation(relation_id: int, db: Session = Depends(get_db)):
    """Edge ablehnen"""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == relation_id).first()
    if not edge:
        return {"error": "Relation nicht gefunden"}
    edge.status = "rejected"
    edge.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"rejected": True}


# --- Relation Targets (für Dropdowns) ---

@router.get("/targets")
def get_relation_targets(type: str = "concept",
                         db: Session = Depends(get_db)):
    """Alle Konzepte als Targets für Dropdown"""
    return [{"id": c.id, "title": c.name} for c in db.query(Concept).all()]


# --- Relationstypen (unverändert) ---

class RelationTypeCreate(BaseModel):
    name: str
    label_de: str
    label_en: str
    description: Optional[str] = None

@type_router.get("")
def get_relation_types(db: Session = Depends(get_db)):
    _ensure_builtin_types(db)
    types = db.query(RelationType).order_by(RelationType.is_builtin.desc()).all()
    return [{
        "id": t.id, "name": t.name,
        "label_de": t.label_de, "label_en": t.label_en,
        "description": t.description, "is_builtin": t.is_builtin,
    } for t in types]

@type_router.post("")
def create_relation_type(data: RelationTypeCreate,
                         db: Session = Depends(get_db)):
    existing = db.query(RelationType).filter(
        RelationType.name == data.name
    ).first()
    if existing:
        return {"error": f"Typ '{data.name}' existiert bereits"}
    rt = RelationType(
        name=data.name, label_de=data.label_de, label_en=data.label_en,
        description=data.description, is_builtin=False,
    )
    db.add(rt)
    db.commit()
    db.refresh(rt)
    return {"id": rt.id, "name": rt.name, "label_de": rt.label_de}
