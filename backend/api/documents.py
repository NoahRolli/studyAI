# API-Endpunkte für Dokument-Upload und Verwaltung
# Upload in Modul oder direkt in Ordner (universell)
# Rename, Delete für Dokumente + Summary-Titel

import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.module import Module
from backend.models.folder import Folder
from backend.models.document import Document
from backend.models.summary import Summary
from backend.services.parser_service import parse_file, SUPPORTED_FORMATS
from backend.infra.config import STORAGE_DIR

router = APIRouter(prefix="/api", tags=["documents"])


class RenameDoc(BaseModel):
    """Schema für Dokument-Umbenennung."""
    display_name: Optional[str] = None


class RenameSummary(BaseModel):
    """Schema für Summary-Titel."""
    title: Optional[str] = None


# GET /api/modules/{id}/documents — Alle Dokumente eines Moduls
@router.get("/modules/{module_id}/documents")
def get_module_documents(module_id: int, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    return module.documents


# GET /api/folders/{id}/documents — Lose Dokumente eines Ordners
@router.get("/folders/{folder_id}/documents")
def get_folder_documents(folder_id: int, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")
    docs = db.query(Document).filter(
        Document.folder_id == folder_id,
        Document.module_id.is_(None)
    ).order_by(Document.uploaded_at.desc()).all()
    return docs


# POST /api/modules/{id}/documents — Datei in Modul hochladen
@router.post("/modules/{module_id}/documents")
def upload_to_module(
    module_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    return _save_document(file, db, module_id=module_id,
                          storage_sub=str(module_id))


# POST /api/folders/{id}/documents — Datei direkt in Ordner hochladen
@router.post("/folders/{folder_id}/documents")
def upload_to_folder(
    folder_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")
    return _save_document(file, db, folder_id=folder_id,
                          storage_sub=f"folders/{folder_id}")


# PUT /api/documents/{id} — Dokument umbenennen
@router.put("/documents/{document_id}")
def rename_document(
    document_id: int, data: RenameDoc, db: Session = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    if data.display_name is not None:
        document.display_name = data.display_name.strip() or None
    db.commit()
    db.refresh(document)
    return {"id": document.id, "filename": document.filename,
            "display_name": document.display_name}


# PUT /api/summaries/{id}/title — Summary-Titel bearbeiten
@router.put("/summaries/{summary_id}/title")
def rename_summary(
    summary_id: int, data: RenameSummary, db: Session = Depends(get_db),
):
    summary = db.query(Summary).filter(Summary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Summary nicht gefunden")
    if data.title is not None:
        summary.title = data.title.strip() or None
    db.commit()
    db.refresh(summary)
    return {"id": summary.id, "title": summary.title}


# DELETE /api/documents/{id} — Dokument löschen
@router.delete("/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    file_path = Path(document.file_path)
    if file_path.exists():
        file_path.unlink()
    db.delete(document)
    db.commit()
    return {"message": f"'{document.filename}' gelöscht"}


def _save_document(
    file: UploadFile, db: Session, *,
    module_id: int | None = None,
    folder_id: int | None = None,
    storage_sub: str,
) -> dict:
    """Gemeinsame Upload-Logik für Modul- und Ordner-Uploads."""
    import os
    suffix = "." + file.filename.split(".")[-1].lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Dateityp '{suffix}' nicht unterstützt. "
                   f"Erlaubt: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )
    target_dir = STORAGE_DIR / storage_sub
    os.makedirs(target_dir, exist_ok=True)
    file_path = target_dir / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        raw_text = parse_file(str(file_path))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    document = Document(
        module_id=module_id, folder_id=folder_id,
        filename=file.filename, file_path=str(file_path),
        file_type=suffix.replace(".", ""), raw_text=raw_text,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return {
        "id": document.id, "filename": document.filename,
        "display_name": document.display_name,
        "file_type": document.file_type,
        "text_length": len(raw_text),
        "message": f"'{file.filename}' hochgeladen und geparst",
    }
