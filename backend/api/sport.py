# Sport API — CRUD für Sport-Einträge im Hauptkalender
# Eigene Tabelle, verknüpft über Datum mit Kalender
# Journal-Insights liest diese Daten für Korrelationsanalyse

import json
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
    muscle_groups: Optional[list[str]] = None
    note: Optional[str] = None

class SportUpdate(BaseModel):
    """Sport-Eintrag aktualisieren."""
    sport_type: Optional[str] = None
    duration_min: Optional[int] = None
    intensity: Optional[int] = None
    muscle_groups: Optional[list[str]] = None
    note: Optional[str] = None

class SportResponse(BaseModel):
    """Sport-Eintrag Response."""
    id: int
    date: date
    sport_type: str
    duration_min: Optional[int]
    intensity: Optional[int]
    muscle_groups: Optional[list[str]] = None
    note: Optional[str]
    model_config = {"from_attributes": True}


# --- Helpers ---
# muscle_groups lebt in der DB als JSON-Text, in der API als list[str].

def _serialize_entry(entry: SportEntry) -> dict:
    """SportEntry -> dict mit muscle_groups als Liste (fuer SportResponse)."""
    raw = entry.muscle_groups
    groups: Optional[list[str]] = None
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                groups = [str(g) for g in parsed]
        except (json.JSONDecodeError, TypeError):
            groups = None
    return {
        "id": entry.id,
        "date": entry.date,
        "sport_type": entry.sport_type,
        "duration_min": entry.duration_min,
        "intensity": entry.intensity,
        "muscle_groups": groups,
        "note": entry.note,
    }


def _dump_for_db(data: dict) -> dict:
    """muscle_groups (list|None) -> JSON-Text fuer die DB-Spalte."""
    if "muscle_groups" in data:
        mg = data["muscle_groups"]
        data["muscle_groups"] = json.dumps(mg) if mg else None
    return data


# --- Endpoints ---

@router.post("", response_model=SportResponse)
def create_sport(data: SportCreate, db: Session = Depends(get_db)):
    """Neuen Sport-Eintrag erstellen."""
    entry = SportEntry(**_dump_for_db(data.model_dump()))
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry)


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
    entries = query.order_by(SportEntry.date.desc()).all()
    return [_serialize_entry(e) for e in entries]


@router.get("/{entry_id}", response_model=SportResponse)
def get_sport(entry_id: int, db: Session = Depends(get_db)):
    """Einzelnen Sport-Eintrag laden."""
    entry = db.query(SportEntry).filter(SportEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return _serialize_entry(entry)


@router.put("/{entry_id}", response_model=SportResponse)
def update_sport(
    entry_id: int, data: SportUpdate, db: Session = Depends(get_db),
):
    """Sport-Eintrag aktualisieren."""
    entry = db.query(SportEntry).filter(SportEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    patch = _dump_for_db(data.model_dump(exclude_unset=True))
    for key, val in patch.items():
        setattr(entry, key, val)
    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry)


@router.delete("/{entry_id}")
def delete_sport(entry_id: int, db: Session = Depends(get_db)):
    """Sport-Eintrag löschen."""
    entry = db.query(SportEntry).filter(SportEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    db.delete(entry)
    db.commit()
    return {"detail": "Eintrag gelöscht"}
