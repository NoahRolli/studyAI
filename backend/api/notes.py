# Notes API — CRUD + Suche + Link-Auflösung für Notizen
# Endpunkte:
# GET    /api/notes          — Alle Notizen (Liste, ohne Content)
# GET    /api/notes/:id      — Einzelne Notiz mit Content
# POST   /api/notes          — Neue Notiz erstellen
# PUT    /api/notes/:id      — Notiz bearbeiten
# DELETE /api/notes/:id      — Notiz löschen
# GET    /api/notes/search   — Volltextsuche über Titel + Content
# GET    /api/notes/:id/links — Alle verlinkten Notizen ([[Links]])

import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from backend.models.database import get_db
from backend.models.note import Note

router = APIRouter(tags=["notes"])

# --- Schemas ---

class NoteCreate(BaseModel):
    """Schema für neue Notiz"""
    title: str
    content: str = ""

class NoteUpdate(BaseModel):
    """Schema für Notiz-Update (beide Felder optional)"""
    title: str | None = None
    content: str | None = None

# Regex für [[Link]] Erkennung im Markdown-Content
LINK_PATTERN = re.compile(r'\[\[([^\]]+)\]\]')


# --- Endpunkte ---

@router.get("/api/notes")
def list_notes(db: Session = Depends(get_db)):
    """Alle Notizen auflisten — ohne Content für Performance"""
    notes = db.query(Note).order_by(Note.updated_at.desc()).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "updated_at": n.updated_at,
            "created_at": n.created_at,
        }
        for n in notes
    ]


@router.get("/api/notes/search")
def search_notes(q: str, db: Session = Depends(get_db)):
    """Volltextsuche über Titel und Content"""
    if not q.strip():
        return []
    pattern = f"%{q}%"
    results = (
        db.query(Note)
        .filter(or_(
            Note.title.ilike(pattern),
            Note.content.ilike(pattern),
        ))
        .order_by(Note.updated_at.desc())
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "updated_at": n.updated_at,
            "created_at": n.created_at,
        }
        for n in results
    ]


@router.get("/api/notes/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    """Einzelne Notiz mit vollem Content laden"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "updated_at": note.updated_at,
        "created_at": note.created_at,
    }


@router.post("/api/notes")
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    """Neue Notiz erstellen"""
    # Prüfen ob Titel schon existiert (für eindeutige [[Links]])
    existing = db.query(Note).filter(Note.title == data.title).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="Notiz mit diesem Titel existiert bereits"
        )
    note = Note(title=data.title, content=data.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "updated_at": note.updated_at,
        "created_at": note.created_at,
    }


@router.put("/api/notes/{note_id}")
def update_note(
    note_id: int, data: NoteUpdate, db: Session = Depends(get_db)
):
    """Notiz bearbeiten — Titel und/oder Content"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    # Titel-Uniqueness prüfen wenn Titel geändert wird
    if data.title is not None and data.title != note.title:
        existing = db.query(Note).filter(Note.title == data.title).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Notiz mit diesem Titel existiert bereits",
            )
        note.title = data.title
    if data.content is not None:
        note.content = data.content
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "updated_at": note.updated_at,
        "created_at": note.created_at,
    }


@router.delete("/api/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    """Notiz löschen"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    db.delete(note)
    db.commit()
    return {"status": "deleted"}


@router.get("/api/notes/{note_id}/links")
def get_note_links(note_id: int, db: Session = Depends(get_db)):
    """Alle [[verlinkten]] Notizen aus dem Content auflösen"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    # [[Link-Titel]] aus dem Content extrahieren
    link_titles = LINK_PATTERN.findall(note.content)
    if not link_titles:
        return []
    # Verlinkte Notizen aus der DB laden
    linked = (
        db.query(Note)
        .filter(Note.title.in_(link_titles))
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "updated_at": n.updated_at,
        }
        for n in linked
    ]
