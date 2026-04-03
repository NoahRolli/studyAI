# Notes API — CRUD + Suche + Links + Backlinks + Pin für Notizen
# Endpunkte:
# GET    /api/notes              — Alle Notizen (Pinned zuerst)
# GET    /api/notes/search       — Volltextsuche über Titel + Content
# GET    /api/notes/:id          — Einzelne Notiz mit Content
# POST   /api/notes              — Neue Notiz erstellen
# PUT    /api/notes/:id          — Notiz bearbeiten
# DELETE /api/notes/:id          — Notiz löschen
# PUT    /api/notes/:id/pin      — Pin-Status umschalten
# GET    /api/notes/:id/links    — Ausgehende [[Links]]
# GET    /api/notes/:id/backlinks — Eingehende Links (Backlinks)

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

# Regex für [[Link]] Erkennung im Content
LINK_PATTERN = re.compile(r'\[\[([^\]]+)\]\]')


# Hilfsfunktion: Notiz als Dict zurückgeben
def _note_to_dict(n: Note, include_content: bool = False) -> dict:
    """Notiz-Objekt als API-Response Dict formatieren"""
    result = {
        "id": n.id,
        "title": n.title,
        "is_pinned": n.is_pinned,
        "updated_at": n.updated_at,
        "created_at": n.created_at,
    }
    if include_content:
        result["content"] = n.content
    return result


# --- Endpunkte ---

@router.get("/api/notes")
def list_notes(db: Session = Depends(get_db)):
    """Alle Notizen — Pinned zuerst, dann nach updated_at"""
    notes = (
        db.query(Note)
        .order_by(Note.is_pinned.desc(), Note.updated_at.desc())
        .all()
    )
    return [_note_to_dict(n) for n in notes]


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
        .order_by(Note.is_pinned.desc(), Note.updated_at.desc())
        .all()
    )
    return [_note_to_dict(n) for n in results]


@router.get("/api/notes/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    """Einzelne Notiz mit vollem Content laden"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    return _note_to_dict(note, include_content=True)


@router.post("/api/notes")
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    """Neue Notiz erstellen — bei doppeltem Titel Zähler anhängen"""
    base_title = data.title
    title = base_title
    counter = 2
    while db.query(Note).filter(Note.title == title).first():
        title = f"{base_title} {counter}"
        counter += 1
    note = Note(title=title, content=data.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_to_dict(note, include_content=True)


@router.put("/api/notes/{note_id}")
def update_note(
    note_id: int, data: NoteUpdate, db: Session = Depends(get_db)
):
    """Notiz bearbeiten — Titel und/oder Content"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
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
    return _note_to_dict(note, include_content=True)


@router.delete("/api/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    """Notiz löschen"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    db.delete(note)
    db.commit()
    return {"status": "deleted"}


@router.put("/api/notes/{note_id}/pin")
def toggle_pin(note_id: int, db: Session = Depends(get_db)):
    """Pin-Status einer Notiz umschalten"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    note.is_pinned = not note.is_pinned
    db.commit()
    db.refresh(note)
    return _note_to_dict(note, include_content=True)


@router.get("/api/notes/{note_id}/links")
def get_note_links(note_id: int, db: Session = Depends(get_db)):
    """Alle [[verlinkten]] Notizen aus dem Content auflösen"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    link_titles = LINK_PATTERN.findall(note.content)
    if not link_titles:
        return []
    linked = db.query(Note).filter(Note.title.in_(link_titles)).all()
    return [_note_to_dict(n) for n in linked]


@router.get("/api/notes/{note_id}/backlinks")
def get_note_backlinks(note_id: int, db: Session = Depends(get_db)):
    """Alle Notizen finden die auf diese Notiz verlinken (Backlinks)"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notiz nicht gefunden")
    pattern = f"%[[{note.title}]]%"
    backlinks = (
        db.query(Note)
        .filter(Note.id != note_id)
        .filter(Note.content.ilike(pattern))
        .order_by(Note.updated_at.desc())
        .all()
    )
    return [_note_to_dict(n) for n in backlinks]
