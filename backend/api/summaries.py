# API-Endpunkte für AI-generierte Zusammenfassungen
# Generieren, Lesen, Bearbeiten, Löschen von Summaries

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.document import Document
from backend.models.summary import Summary
from backend.services.ai_service import summarize, get_active_provider_name

router = APIRouter(prefix="/api", tags=["summaries"])


class SummaryUpdate(BaseModel):
    """Schema für Summary-Content-Update."""
    content: Optional[str] = None
    key_terms: Optional[list[str]] = None


# POST /api/documents/{id}/summarize — Zusammenfassung generieren
@router.post("/documents/{document_id}/summarize")
async def create_summary(document_id: int, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden.")
    if not document.raw_text:
        raise HTTPException(status_code=400,
            detail="Kein Text vorhanden. Wurde die Datei korrekt geparst?")
    try:
        result = await summarize(document.raw_text)
    except Exception as e:
        raise HTTPException(status_code=503,
            detail=f"AI-Service nicht verfügbar: {e}")
    summary = Summary(
        document_id=document_id, content=result["summary"],
        key_terms=result["key_terms"],
        ai_provider=get_active_provider_name(),
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return {
        "id": summary.id, "document_id": document_id,
        "summary": summary.content, "key_terms": summary.key_terms,
        "ai_provider": summary.ai_provider,
        "message": "Zusammenfassung erfolgreich generiert.",
    }


# GET /api/documents/{id}/summaries — Alle Summaries eines Dokuments
@router.get("/documents/{document_id}/summaries")
def get_summaries(document_id: int, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden.")
    summaries = db.query(Summary).filter(
        Summary.document_id == document_id).all()
    return [
        {"id": s.id, "summary": s.content, "title": s.title,
         "key_terms": s.key_terms, "ai_provider": s.ai_provider,
         "created_at": s.created_at.isoformat()}
        for s in summaries
    ]


# GET /api/summaries/{id} — Einzelne Zusammenfassung
@router.get("/summaries/{summary_id}")
def get_summary(summary_id: int, db: Session = Depends(get_db)):
    summary = db.query(Summary).filter(Summary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Zusammenfassung nicht gefunden.")
    return {
        "id": summary.id, "document_id": summary.document_id,
        "summary": summary.content, "title": summary.title,
        "key_terms": summary.key_terms, "ai_provider": summary.ai_provider,
        "created_at": summary.created_at.isoformat(),
    }


# PUT /api/summaries/{id} — Summary-Content bearbeiten
@router.put("/summaries/{summary_id}")
def update_summary(
    summary_id: int, data: SummaryUpdate, db: Session = Depends(get_db),
):
    summary = db.query(Summary).filter(Summary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Zusammenfassung nicht gefunden.")
    if data.content is not None:
        summary.content = data.content
    if data.key_terms is not None:
        summary.key_terms = data.key_terms
    db.commit()
    db.refresh(summary)
    return {
        "id": summary.id, "summary": summary.content,
        "title": summary.title, "key_terms": summary.key_terms,
    }


# DELETE /api/summaries/{id} — Zusammenfassung löschen
@router.delete("/summaries/{summary_id}")
def delete_summary(summary_id: int, db: Session = Depends(get_db)):
    summary = db.query(Summary).filter(Summary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Zusammenfassung nicht gefunden.")
    db.delete(summary)
    db.commit()
    return {"message": "Zusammenfassung gelöscht."}
