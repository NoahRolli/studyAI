# API-Endpunkte für die Ordner-Hierarchie
# Ordner können verschachtelt werden (Ordner in Ordnern)
# Module können in Ordner verschoben werden
#
# Endpunkte:
# - GET /api/folders/contents?parent_id=X — Inhalt eines Ordners (Unterordner + Module)
# - POST /api/folders — Neuen Ordner erstellen
# - PUT /api/folders/{id} — Ordner umbenennen oder verschieben
# - DELETE /api/folders/{id} — Ordner löschen (inkl. Inhalt)
# - PUT /api/modules/{id}/move — Modul in einen Ordner verschieben

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.models.database import get_db
from backend.models.folder import Folder
from backend.models.module import Module

# Router — wird in main.py registriert
router = APIRouter(prefix="/api/folders", tags=["folders"])


# --- Pydantic Schemas ---

class FolderCreate(BaseModel):
    """Neuen Ordner erstellen — Name + optionaler Parent."""
    name: str
    parent_id: Optional[int] = None  # NULL = Root-Level


class FolderUpdate(BaseModel):
    """Ordner umbenennen oder in anderen Ordner verschieben."""
    name: Optional[str] = None
    parent_id: Optional[int] = None


class ModuleMove(BaseModel):
    """Modul in einen Ordner verschieben. NULL = zurück auf Root."""
    folder_id: Optional[int] = None


# --- Endpunkte ---

@router.get("/contents")
def get_folder_contents(
    parent_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Inhalt eines Ordners abrufen: Unterordner + Module.
    parent_id=NULL → Root-Level (Dashboard)
    parent_id=5 → Inhalt von Ordner 5
    """
    # Unterordner auf dieser Ebene
    folders = db.query(Folder).filter(Folder.parent_id == parent_id).all()

    # Module auf dieser Ebene
    modules = db.query(Module).filter(Module.folder_id == parent_id).all()

    return {
        "parent_id": parent_id,
        "folders": [
            {
                "id": f.id,
                "name": f.name,
                "parent_id": f.parent_id,
                "created_at": f.created_at.isoformat(),
            }
            for f in folders
        ],
        "modules": modules,
    }


@router.get("/{folder_id}")
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    """Einzelnen Ordner abrufen (für Breadcrumb-Navigation)."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "created_at": folder.created_at.isoformat(),
    }


@router.get("/{folder_id}/breadcrumbs")
def get_breadcrumbs(folder_id: int, db: Session = Depends(get_db)):
    """
    Breadcrumb-Pfad vom Root bis zum aktuellen Ordner.
    Gibt eine Liste zurück: [Root-Ordner, ..., Aktueller Ordner]
    Wird fürs Frontend benötigt um den Pfad anzuzeigen.
    """
    crumbs = []
    current_id: Optional[int] = folder_id

    # Vom aktuellen Ordner nach oben bis Root traversieren
    # Max 20 Ebenen um Endlosschleifen zu vermeiden
    for _ in range(20):
        if current_id is None:
            break
        folder = db.query(Folder).filter(Folder.id == current_id).first()
        if not folder:
            break
        crumbs.append({
            "id": folder.id,
            "name": folder.name,
        })
        current_id = folder.parent_id

    # Umkehren: Root zuerst, aktueller Ordner zuletzt
    crumbs.reverse()
    return crumbs


@router.post("/")
def create_folder(data: FolderCreate, db: Session = Depends(get_db)):
    """Neuen Ordner erstellen. parent_id=NULL → Root-Level."""
    # Falls parent_id angegeben, prüfen ob Eltern-Ordner existiert
    if data.parent_id is not None:
        parent = db.query(Folder).filter(Folder.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Eltern-Ordner nicht gefunden")

    folder = Folder(name=data.name, parent_id=data.parent_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "message": "Ordner erstellt",
    }


@router.put("/{folder_id}")
def update_folder(
    folder_id: int,
    data: FolderUpdate,
    db: Session = Depends(get_db),
):
    """Ordner umbenennen oder in anderen Ordner verschieben."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")

    if data.name is not None:
        folder.name = data.name
    if data.parent_id is not None:
        # Verhindere dass ein Ordner in sich selbst verschoben wird
        if data.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Ordner kann nicht in sich selbst verschoben werden")
        folder.parent_id = data.parent_id

    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "message": "Ordner aktualisiert"}


@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    """
    Ordner löschen — inkl. aller Unterordner und Module darin.
    Rekursiv: Unterordner werden ebenfalls gelöscht.
    Module in gelöschten Ordnern werden auch gelöscht.
    """
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Ordner nicht gefunden")

    # Rekursiv alle Unterordner sammeln
    def collect_subfolder_ids(parent: int) -> list[int]:
        sub_ids = []
        subs = db.query(Folder).filter(Folder.parent_id == parent).all()
        for sub in subs:
            sub_ids.append(sub.id)
            sub_ids.extend(collect_subfolder_ids(sub.id))
        return sub_ids

    all_folder_ids = [folder_id] + collect_subfolder_ids(folder_id)

    # Alle Module in diesen Ordnern löschen
    db.query(Module).filter(Module.folder_id.in_(all_folder_ids)).delete(
        synchronize_session=False
    )

    # Alle Ordner löschen (von unten nach oben)
    db.query(Folder).filter(Folder.id.in_(all_folder_ids)).delete(
        synchronize_session=False
    )

    db.commit()
    return {"message": f"Ordner '{folder.name}' und Inhalt gelöscht"}


# --- Modul verschieben ---

@router.put("/move-module/{module_id}")
def move_module(
    module_id: int,
    data: ModuleMove,
    db: Session = Depends(get_db),
):
    """Modul in einen Ordner verschieben. folder_id=NULL → zurück auf Root."""
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")

    # Falls Ziel-Ordner angegeben, prüfen ob er existiert
    if data.folder_id is not None:
        target = db.query(Folder).filter(Folder.id == data.folder_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Ziel-Ordner nicht gefunden")

    module.folder_id = data.folder_id
    db.commit()
    return {"id": module.id, "message": "Modul verschoben"}