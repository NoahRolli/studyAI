# Konzept-Graph CRUD API — Lesen, Editieren, Mergen, Löschen
# Endpunkte für Graph-View, Liste, Detail, Edge-Management
# Edges nutzen relation_type_id (FK auf relation_types) + origin + status

import logging
from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime, timezone
from backend.models.database import get_db
from backend.models.concept import (
    Concept, ConceptSource, ConceptEdge,

)
from backend.models.relation import RelationType
from backend.models.note import Note
from backend.models.summary import Summary
from backend.models.llm import LLMMessage, LLMConversation

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




@router.get("/{concept_id}/chat-sources")
def get_concept_chat_sources(concept_id: int, db: Session = Depends(get_db)):
    """Chat-Message Quellen eines Konzepts, mit Preview+Doc-ID für Navigation.

    Separater Endpoint weil pro Konzept schnell 200+ Messages existieren können —
    /api/concepts/{id} würde sonst aufgebläht. Lazy-loaded im Frontend.
    """
    # Konzept muss existieren
    exists = db.query(Concept.id).filter(Concept.id == concept_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Konzept nicht gefunden")

    # Join: concept_sources → llm_messages → llm_conversations → documents
    # source_id in concept_sources ist llm_messages.id bei source_type='chat_message'
    rows = (
        db.query(
            LLMMessage.id.label("message_id"),
            LLMMessage.turn_index,
            LLMMessage.role,
            LLMMessage.text,
            LLMConversation.document_id,
            LLMConversation.title.label("conversation_title"),
            LLMConversation.provider_created_at,
            ConceptSource.relevance,
        )
        .join(ConceptSource, ConceptSource.source_id == LLMMessage.id)
        .join(LLMConversation, LLMMessage.conversation_id == LLMConversation.id)
        .filter(
            ConceptSource.concept_id == concept_id,
            ConceptSource.source_type == "chat_message",
        )
        .order_by(ConceptSource.relevance.desc(), LLMConversation.provider_created_at.desc())
        .all()
    )

    return {
        "concept_id": concept_id,
        "count": len(rows),
        "sources": [
            {
                "message_id": r.message_id,
                "document_id": r.document_id,
                "turn_index": r.turn_index,
                "role": r.role,
                "text_preview": (r.text or "")[:140],
                "conversation_title": r.conversation_title or "(ohne Titel)",
                "created_at": r.provider_created_at.isoformat() if r.provider_created_at else None,
                "relevance": r.relevance,
            }
            for r in rows
        ],
    }


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


@router.delete("/orphaned")
def delete_orphaned_concepts(db: Session = Depends(get_db)):
    """Verwaiste Konzepte löschen — ohne Quellen UND ohne Edges."""
    concepts = db.query(Concept).all()
    deleted = 0
    for c in concepts:
        has_sources = db.query(ConceptSource).filter(
            ConceptSource.concept_id == c.id
        ).first()
        if has_sources:
            continue
        has_edges = db.query(ConceptEdge).filter(
            or_(
                ConceptEdge.source_concept_id == c.id,
                ConceptEdge.target_concept_id == c.id,
            )
        ).first()
        if has_edges:
            continue
        db.delete(c)
        deleted += 1
    db.commit()
    logger.info(f"{deleted} verwaiste Konzepte gelöscht")
    return {"deleted": deleted}
