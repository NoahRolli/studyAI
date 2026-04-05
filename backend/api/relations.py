# Relations API — CRUD, Bestätigung/Ablehnung, Typ-Management
# Typisierte Wissensrelationen zwischen Notes, Summaries, Modules
# Built-in Typen werden beim ersten Aufruf automatisch angelegt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from backend.models.database import get_db
from backend.models.relation import Relation, RelationType
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.document import Document
from backend.models.module import Module

router = APIRouter(prefix="/api/relations", tags=["relations"])
type_router = APIRouter(prefix="/api/relation-types", tags=["relations"])

# --- Built-in Relationstypen (werden automatisch angelegt) ---
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
    """Erstellt Built-in Typen falls sie noch nicht existieren"""
    existing = {t.name for t in db.query(RelationType.name).all()}
    for name, de, en, desc in BUILTIN_TYPES:
        if name not in existing:
            db.add(RelationType(
                name=name, label_de=de, label_en=en,
                description=desc, is_builtin=True,
            ))
    db.commit()


# --- Pydantic Schemas ---
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

class RelationTypeCreate(BaseModel):
    name: str
    label_de: str
    label_en: str
    description: Optional[str] = None


# --- Relation CRUD ---
@router.get("")
def get_relations(
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    relation_type_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Alle Relationen laden, optional gefiltert"""
    _ensure_builtin_types(db)
    q = db.query(Relation)
    if status:
        q = q.filter(Relation.status == status)
    if source_type and source_id:
        # Relationen wo Node Subjekt ODER Objekt ist
        q = q.filter(or_(
            (Relation.source_type == source_type) & (Relation.source_id == source_id),
            (Relation.target_type == source_type) & (Relation.target_id == source_id),
        ))
    if relation_type_id:
        q = q.filter(Relation.relation_type_id == relation_type_id)
    relations = q.order_by(Relation.created_at.desc()).all()
    # Typ-Info mitlesen
    type_map = {t.id: t for t in db.query(RelationType).all()}
    title_cache = _build_title_cache(db)
    return [_serialize_relation(r, type_map, title_cache) for r in relations]


@router.post("")
def create_relation(data: RelationCreate, db: Session = Depends(get_db)):
    """Manuell eine Relation erstellen (Status: confirmed)"""
    rel = Relation(
        source_type=data.source_type, source_id=data.source_id,
        target_type=data.target_type, target_id=data.target_id,
        relation_type_id=data.relation_type_id,
        reason=data.reason, status="confirmed", created_by="user",
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    type_map = {t.id: t for t in db.query(RelationType).all()}
    tc = _build_title_cache(db)
    return _serialize_relation(rel, type_map, tc)


@router.put("/{relation_id}")
def update_relation(
    relation_id: int, data: RelationUpdate, db: Session = Depends(get_db),
):
    """Relation bearbeiten (Typ oder Begründung ändern)"""
    rel = db.query(Relation).filter(Relation.id == relation_id).first()
    if not rel:
        return {"error": "Relation nicht gefunden"}
    if data.relation_type_id is not None:
        rel.relation_type_id = data.relation_type_id
    if data.reason is not None:
        rel.reason = data.reason
    db.commit()
    db.refresh(rel)
    type_map = {t.id: t for t in db.query(RelationType).all()}
    tc = _build_title_cache(db)
    return _serialize_relation(rel, type_map, tc)


@router.delete("/{relation_id}")
def delete_relation(relation_id: int, db: Session = Depends(get_db)):
    """Relation löschen"""
    rel = db.query(Relation).filter(Relation.id == relation_id).first()
    if not rel:
        return {"error": "Relation nicht gefunden"}
    db.delete(rel)
    db.commit()
    return {"deleted": True}


@router.put("/{relation_id}/confirm")
def confirm_relation(relation_id: int, db: Session = Depends(get_db)):
    """AI-Vorschlag bestätigen → wird zur fixen Relation"""
    rel = db.query(Relation).filter(Relation.id == relation_id).first()
    if not rel:
        return {"error": "Relation nicht gefunden"}
    rel.status = "confirmed"
    db.commit()
    return {"confirmed": True}


@router.put("/{relation_id}/reject")
def reject_relation(relation_id: int, db: Session = Depends(get_db)):
    """AI-Vorschlag ablehnen"""
    rel = db.query(Relation).filter(Relation.id == relation_id).first()
    if not rel:
        return {"error": "Relation nicht gefunden"}
    rel.status = "rejected"
    db.commit()
    return {"rejected": True}


# --- Relationstypen ---
@type_router.get("")
def get_relation_types(db: Session = Depends(get_db)):
    """Alle Relationstypen (built-in + custom)"""
    _ensure_builtin_types(db)
    types = db.query(RelationType).order_by(RelationType.is_builtin.desc()).all()
    return [
        {
            "id": t.id, "name": t.name,
            "label_de": t.label_de, "label_en": t.label_en,
            "description": t.description, "is_builtin": t.is_builtin,
        }
        for t in types
    ]


@type_router.post("")
def create_relation_type(data: RelationTypeCreate, db: Session = Depends(get_db)):
    """Custom Relationstyp hinzufügen"""
    existing = db.query(RelationType).filter(RelationType.name == data.name).first()
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


# --- Hilfsfunktionen ---
def _build_title_cache(db: Session) -> dict:
    """Titel-Cache für alle Node-Typen aufbauen"""
    cache = {}
    for note in db.query(Note).all():
        cache[f"note:{note.id}"] = note.title
    for summary in db.query(Summary).all():
        doc = db.query(Document).filter(Document.id == summary.document_id).first()
        cache[f"summary:{summary.id}"] = doc.filename if doc else f"Summary {summary.id}"
    for module in db.query(Module).all():
        cache[f"module:{module.id}"] = module.name
    return cache


def _serialize_relation(rel: Relation, type_map: dict, title_cache: dict = {}) -> dict:
    """Relation als Dict mit Typ-Info und Node-Titeln serialisieren"""
    rt = type_map.get(rel.relation_type_id)
    return {
        "id": rel.id,
        "source_type": rel.source_type, "source_id": rel.source_id,
        "source_title": title_cache.get(
            f"{rel.source_type}:{rel.source_id}",
            f"{rel.source_type} #{rel.source_id}",
        ),
        "target_type": rel.target_type, "target_id": rel.target_id,
        "target_title": title_cache.get(
            f"{rel.target_type}:{rel.target_id}",
            f"{rel.target_type} #{rel.target_id}",
        ),
        "relation_type": {
            "id": rt.id, "name": rt.name,
            "label_de": rt.label_de, "label_en": rt.label_en,
        } if rt else None,
        "status": rel.status,
        "reason": rel.reason,
        "created_by": rel.created_by,
        "created_at": rel.created_at.isoformat() if rel.created_at else None,
    }
