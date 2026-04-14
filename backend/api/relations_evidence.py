# Relations Evidence — Quellen + Textauszüge für Ontologie-Vorschläge
# Zeigt gemeinsame Dokumente zweier Konzepte einer Relation
# Wird vom Frontend bei Klick auf eine Suggestion geladen

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.concept import Concept, ConceptEdge, ConceptSource
from backend.models.summary import Summary
from backend.models.note import Note

router = APIRouter(prefix="/api/relations", tags=["relations-evidence"])


def _source_info(cs: ConceptSource, db: Session) -> dict | None:
    """Baut Quell-Info mit Textauszug für eine ConceptSource."""
    if cs.source_type == "note":
        note = db.query(Note).filter(Note.id == cs.source_id).first()
        if not note:
            return None
        return {
            "type": "note", "id": note.id, "title": note.title,
            "excerpt": (note.content or "")[:500],
            "url": f"/notes?open={note.id}",
        }
    elif cs.source_type == "summary":
        summary = db.query(Summary).filter(Summary.id == cs.source_id).first()
        if not summary:
            return None
        mod_id = summary.module_id if hasattr(summary, "module_id") else None
        return {
            "type": "summary", "id": summary.id,
            "title": summary.title or f"Summary #{summary.id}",
            "excerpt": (summary.content or "")[:500],
            "url": f"/modules/{mod_id}" if mod_id else None,
        }
    return None


@router.get("/{edge_id}/evidence")
async def get_relation_evidence(edge_id: int, db: Session = Depends(get_db)):
    """Gibt gemeinsame Quellen beider Konzepte + Textauszüge zurück."""
    edge = db.query(ConceptEdge).filter(ConceptEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(404, "Relation nicht gefunden")

    src_sources = db.query(ConceptSource).filter(
        ConceptSource.concept_id == edge.source_concept_id
    ).all()
    tgt_sources = db.query(ConceptSource).filter(
        ConceptSource.concept_id == edge.target_concept_id
    ).all()

    src_infos = [i for i in (_source_info(s, db) for s in src_sources) if i]
    tgt_infos = [i for i in (_source_info(s, db) for s in tgt_sources) if i]

    # Gemeinsame Quellen (gleicher type+id)
    src_keys = {(i["type"], i["id"]) for i in src_infos}
    tgt_keys = {(i["type"], i["id"]) for i in tgt_infos}
    shared_keys = src_keys & tgt_keys
    shared = [i for i in src_infos if (i["type"], i["id"]) in shared_keys]

    src_concept = db.query(Concept).filter(
        Concept.id == edge.source_concept_id).first()
    tgt_concept = db.query(Concept).filter(
        Concept.id == edge.target_concept_id).first()

    return {
        "edge_id": edge_id,
        "source": {"name": src_concept.name if src_concept else "?",
                    "sources": src_infos},
        "target": {"name": tgt_concept.name if tgt_concept else "?",
                    "sources": tgt_infos},
        "shared_sources": shared,
        "reason": edge.reason,
    }
