# API-Endpunkte für Studienmodule (CRUD)
# Hier werden nur Anfragen entgegengenommen und an die Datenbank weitergeleitet
# Keine Business-Logik — die kommt später in services/

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.models.database import get_db
from backend.models.module import Module

# Router-Objekt — wird in main.py registriert
router = APIRouter(prefix="/api/modules", tags=["modules"])


# --- Pydantic Schemas: Definieren was rein und raus geht ---

# Schema für das Erstellen eines Moduls (was der User sendet)
class ModuleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#4a90d9"


# Schema für das Aktualisieren eines Moduls
class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


# --- Endpunkte ---

# GET /api/modules — Alle Module auflisten
@router.get("/")
def get_modules(db: Session = Depends(get_db)):
    modules = db.query(Module).all()
    return modules


# POST /api/modules — Neues Modul erstellen
@router.post("/")
def create_module(data: ModuleCreate, db: Session = Depends(get_db)):
    module = Module(name=data.name, description=data.description, color=data.color)
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


# GET /api/modules/{id} — Ein bestimmtes Modul abrufen
@router.get("/{module_id}")
def get_module(module_id: int, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    return module


# PUT /api/modules/{id} — Modul aktualisieren
@router.put("/{module_id}")
def update_module(module_id: int, data: ModuleUpdate, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")

    # Nur Felder aktualisieren die mitgeschickt wurden
    if data.name is not None:
        module.name = data.name
    if data.description is not None:
        module.description = data.description
    if data.color is not None:
        module.color = data.color

    db.commit()
    db.refresh(module)
    return module


# DELETE /api/modules/{id} — Modul löschen (inkl. aller Dokumente)
@router.delete("/{module_id}")
def delete_module(module_id: int, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")

    db.delete(module)
    db.commit()
    return {"message": f"Modul '{module.name}' gelöscht"}