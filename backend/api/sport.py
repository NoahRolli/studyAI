# Sport API — CRUD für Sport-Einträge im Hauptkalender
# Eigene Tabelle, verknüpft über Datum mit Kalender
# Journal-Insights liest diese Daten für Korrelationsanalyse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from typing import Optional

from backend.models.database import get_db
from backend.models.sport_entry import SportEntry

router = APIRouter(prefix="/api/sport", tags=["sport"])


# --- Schemas ---

class SportCreate(BaseModel):
    """Neuen Sport-Eintrag erstellen."""
    date: date
    sport_type: str
    duration_min: Optional[int] = None
    intensity: Optional[int] = None
    note: Optional[str] = None

class SportUpdate(BaseModel):
    """Sport-Eintrag aktualisieren."""
    sport_type: Optional[str] = None
    duration_min: Optional[int] = None
    intensity: Optional[int] = None
    note: Optional[str] = None

class SportResponse(BaseModel):
    """Sport-Eintrag Response."""
    id: int
    date: date
    sport_type: str
    duration_min: Optional[int]
    intensity: Optional[int]
    note: Optional[str]
    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.post("", response_model=SportResponse)
def create_sport(data: SportCreate, db: Session = Depends(get_db)):
    """Neuen Sport-Eintrag erstellen."""
    entry = SportEntry(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=list[SportResponse])
def list_sport(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Sport-Einträge laden, optional nach Monat/Jahr."""
    query = db.query(SportEntry)
    if month and year:
        query = query.filter(
            SportEntry.date >= date(year, month, 1),
            SportEntry.date < (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)),
        )
    return query.order_by(SportEntry.date.desc()).all()


@router.get("/{entry_id}", response_model=SportResponse)
def get_sport(entry_id: int, db: Session = Depends(get_db)):
    """Einzelnen Sport-Eintrag laden."""
    entry = db.query(SportEntry).filter(SportEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return entry


@router.put("/{entry_id}", response_model=SportResponse)
def update_sport(
    entry_id: int, data: SportUpdate, db: Session = Depends(get_db),
):
    """Sport-Eintrag aktualisieren."""
    entry = db.query(SportEntry).filter(SportEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, val)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
def delete_sport(entry_id: int, db: Session = Depends(get_db)):
    """Sport-Eintrag löschen."""
    entry = db.query(SportEntry).filter(SportEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    db.delete(entry)
    db.commit()
    return {"detail": "Eintrag gelöscht"}
