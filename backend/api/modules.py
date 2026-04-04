# API-Endpunkte für Studienmodule (CRUD + Pin)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.models.database import get_db
from backend.models.module import Module

router = APIRouter(prefix="/api/modules", tags=["modules"])


class ModuleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#4a90d9"

class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


@router.get("/")
def get_modules(db: Session = Depends(get_db)):
    return db.query(Module).all()


@router.post("/")
def create_module(data: ModuleCreate, db: Session = Depends(get_db)):
    module = Module(name=data.name, description=data.description, color=data.color)
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


@router.get("/{module_id}")
def get_module(module_id: int, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    return module


@router.put("/{module_id}")
def update_module(module_id: int, data: ModuleUpdate, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    if data.name is not None:
        module.name = data.name
    if data.description is not None:
        module.description = data.description
    if data.color is not None:
        module.color = data.color
    db.commit()
    db.refresh(module)
    return module


@router.put("/{module_id}/pin")
def toggle_pin_module(module_id: int, db: Session = Depends(get_db)):
    """Pin-Status eines Moduls umschalten."""
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    module.is_pinned = not module.is_pinned
    db.commit()
    return {"id": module.id, "is_pinned": module.is_pinned}


@router.delete("/{module_id}")
def delete_module(module_id: int, db: Session = Depends(get_db)):
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Modul nicht gefunden")
    db.delete(module)
    db.commit()
    return {"message": f"Modul '{module.name}' gelöscht"}
