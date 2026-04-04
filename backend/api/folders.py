# API-Endpunkte für die Ordner-Hierarchie
# Ordner können verschachtelt werden (Ordner in Ordnern)
# Module können in Ordner verschoben werden
# Sortierung: Gepinnte zuerst, dann nach sort_order

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import asc
from pydantic import BaseModel
from typing import Optional
from backend.models.database import get_db
from backend.models.folder import Folder
from backend.models.module import Module

router = APIRouter(prefix="/api/folders", tags=["folders"])


# --- Pydantic Schemas ---

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

class ModuleMove(BaseModel):
    folder_id: Optional[int] = None

class SortOrderItem(BaseModel):
    id: int
    sort_order: int

class SortOrderUpdate(BaseModel):
    folders: list[SortOrderItem] = []
    modules: list[SortOrderItem] = []


# --- Endpunkte ---

@router.get("/contents")
def get_folder_contents(
    parent_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Inhalt eines Ordners: Unterordner + Module, sortiert."""
    folders = (
        db.query(Folder)
        .filter(Folder.parent_id == parent_id)
        .order_by(Folder.is_pinned.desc(), asc(Folder.sort_order), asc(Folder.id))
        .all()
    )
    modules = (
        db.query(Module)
        .filter(Module.folder_id == parent_id)
        .order_by(Module.is_pinned.desc(), asc(Module.sort_order), asc(Module.id))
        .all()
    )
    return {
        "parent_id": parent_id,
        "folders": [
            {
                "id": f.id,
                "name": f.name,
                "parent_id": f.parent_id,
                "sort_order": f.sort_order,
                "is_pinned": f.is_pinned,
                "created_at": f.created_at.isoformat(),
            }
            for f in folders
        ],
        "modules": modules,
    }


@router.get("/{folder_id}")
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    """Einzelnen Ordner abrufen."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "sort_order": folder.sort_order,
        "is_pinned": folder.is_pinned,
        "created_at": folder.created_at.isoformat(),
    }


@router.get("/{folder_id}/breadcrumbs")
def get_breadcrumbs(folder_id: int, db: Session = Depends(get_db)):
    """Breadcrumb-Pfad vom Root bis zum aktuellen Ordner."""
    crumbs = []
    current_id: Optional[int] = folder_id
    for _ in range(20):
        if current_id is None:
            break
        folder = db.query(Folder).filter(Folder.id == current_id).first()
        if not folder:
            break
        crumbs.append({"id": folder.id, "name": folder.name})
        current_id = folder.parent_id
    crumbs.reverse()
    return crumbs


@router.post("/")
def create_folder(data: FolderCreate, db: Session = Depends(get_db)):
    """Neuen Ordner erstellen."""
    if data.parent_id is not None:
        parent = db.query(Folder).filter(Folder.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Eltern-Ordner nicht gefunden")
    # sort_order = Anzahl bestehender Ordner auf gleicher Ebene
    count = db.query(Folder).filter(Folder.parent_id == data.parent_id).count()
    folder = Folder(name=data.name, parent_id=data.parent_id, sort_order=count)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "parent_id": folder.parent_id}


@router.put("/{folder_id}")
def update_folder(folder_id: int, data: FolderUpdate, db: Session = Depends(get_db)):
    """Ordner umbenennen oder verschieben."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")
    if data.name is not None:
        folder.name = data.name
    if data.parent_id is not None:
        if data.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Ordner kann nicht in sich selbst verschoben werden")
        folder.parent_id = data.parent_id
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name}


@router.put("/{folder_id}/pin")
def toggle_pin_folder(folder_id: int, db: Session = Depends(get_db)):
    """Pin-Status eines Ordners umschalten."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")
    folder.is_pinned = not folder.is_pinned
    db.commit()
    return {"id": folder.id, "is_pinned": folder.is_pinned}


@router.put("/sort-order/update")
def update_sort_order(data: SortOrderUpdate, db: Session = Depends(get_db)):
    """Reihenfolge von Ordnern und Modulen batch-aktualisieren."""
    for item in data.folders:
        folder = db.query(Folder).filter(Folder.id == item.id).first()
        if folder:
            folder.sort_order = item.sort_order
    for item in data.modules:
        module = db.query(Module).filter(Module.id == item.id).first()
        if module:
            module.sort_order = item.sort_order
    db.commit()
    return {"message": "Reihenfolge aktualisiert"}


@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    """Ordner löschen inkl. aller Unterordner und Module."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")

    folder_name = folder.name

    def collect_subfolder_ids(parent: int) -> list[int]:
        sub_ids = []
        subs = db.query(Folder).filter(Folder.parent_id == parent).all()
        for sub in subs:
            sub_ids.append(sub.id)
            sub_ids.extend(collect_subfolder_ids(sub.id))
        return sub_ids

    all_folder_ids = [folder_id] + collect_subfolder_ids(folder_id)
    db.query(Module).filter(Module.folder_id.in_(all_folder_ids)).delete(synchronize_session=False)
    db.query(Folder).filter(Folder.id.in_(all_folder_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Ordner '{folder_name}' und Inhalt gelöscht"}


@router.put("/move-module/{module_id}")
def move_module(module_id: int, data: ModuleMove, db: Session = Depends(get_db)):
    """Modul in einen Ordner verschieben."""
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    if data.folder_id is not None:
        target = db.query(Folder).filter(Folder.id == data.folder_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Ziel-Ordner nicht gefunden")
    module.folder_id = data.folder_id
    db.commit()
    return {"id": module.id, "message": "Modul verschoben"}
