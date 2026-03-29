"""
Hauptkalender – Pydantic Schemas.
Validierung für Event-Erstellung, -Update und API-Responses.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


# Erlaubte Farbkategorien für Events
VALID_COLORS = ["cyan", "violet", "emerald", "orange", "pink", "yellow"]

# Erlaubte Wiederholungs-Typen
VALID_RECURRENCES = ["none", "daily", "weekly", "monthly", "yearly"]


class EventCreate(BaseModel):
    """Schema zum Erstellen eines neuen Events."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    start_time: datetime
    end_time: Optional[datetime] = None
    all_day: bool = False
    color: str = Field("cyan", pattern=f"^({'|'.join(VALID_COLORS)})$")
    recurrence: str = Field("none", pattern=f"^({'|'.join(VALID_RECURRENCES)})$")
    recurrence_end: Optional[datetime] = None


class EventUpdate(BaseModel):
    """Schema zum Aktualisieren – alle Felder optional."""

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    all_day: Optional[bool] = None
    color: Optional[str] = Field(None, pattern=f"^({'|'.join(VALID_COLORS)})$")
    recurrence: Optional[str] = Field(None, pattern=f"^({'|'.join(VALID_RECURRENCES)})$")
    recurrence_end: Optional[datetime] = None


class EventResponse(BaseModel):
    """API-Response für ein einzelnes Event."""

    id: int
    title: str
    description: Optional[str]
    start_time: datetime
    end_time: Optional[datetime]
    all_day: bool
    color: str
    recurrence: str
    recurrence_end: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgendaItem(BaseModel):
    """Ein aufgelöstes Event in der Agenda-Ansicht (inkl. wiederkehrende)."""

    event_id: int
    title: str
    description: Optional[str]
    date: datetime
    end_time: Optional[datetime]
    all_day: bool
    color: str
    is_recurring: bool