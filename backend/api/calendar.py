"""
Hauptkalender – API Router.
CRUD-Operationen für Events + Agenda-Endpoint (nächste 7 Tage).
Komplett getrennt vom Journal – kein Zugriff auf verschlüsselte Daten.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from backend.models.database import get_db
from backend.models.calendar_event import CalendarEvent
from backend.api.calendar_schemas import (
    EventCreate,
    EventUpdate,
    EventResponse,
    AgendaItem,
)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


# --- CRUD ---


@router.post("/events", response_model=EventResponse)
def create_event(data: EventCreate, db: Session = Depends(get_db)):
    """Neues Event erstellen."""
    event = CalendarEvent(**data.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/events", response_model=list[EventResponse])
def list_events(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Alle Events laden, optional gefiltert nach Monat/Jahr."""
    query = db.query(CalendarEvent)
    if month and year:
        # Monatsanfang und -ende berechnen
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)
        query = query.filter(
            CalendarEvent.start_time >= start,
            CalendarEvent.start_time < end,
        )
    return query.order_by(CalendarEvent.start_time).all()


@router.get("/events/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    """Einzelnes Event laden."""
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event nicht gefunden")
    return event


@router.put("/events/{event_id}", response_model=EventResponse)
def update_event(event_id: int, data: EventUpdate, db: Session = Depends(get_db)):
    """Event aktualisieren (nur gesetzte Felder)."""
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event nicht gefunden")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    """Event löschen."""
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event nicht gefunden")
    db.delete(event)
    db.commit()
    return {"detail": "Event gelöscht"}


# --- Agenda (nächste N Tage, mit Wiederholungs-Auflösung) ---


@router.get("/agenda", response_model=list[AgendaItem])
def get_agenda(days: int = 7, db: Session = Depends(get_db)):
    """Agenda für die nächsten N Tage, wiederkehrende Events aufgelöst."""
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = today + timedelta(days=days)
    items: list[AgendaItem] = []

    # Alle Events laden die im Zeitraum relevant sein könnten
    events = db.query(CalendarEvent).filter(
        # Einmalige Events im Zeitraum ODER wiederkehrende Events
        (CalendarEvent.start_time < end_date)
        & (
            (CalendarEvent.recurrence == "none")
            | (CalendarEvent.recurrence != "none")
        )
    ).all()

    for event in events:
        if event.recurrence == "none":
            # Einmaliges Event – nur wenn im Zeitraum
            if today <= event.start_time < end_date:
                items.append(_to_agenda_item(event, event.start_time))
        else:
            # Wiederkehrend – alle Vorkommen im Zeitraum berechnen
            occurrences = _expand_recurrence(event, today, end_date)
            for occ in occurrences:
                items.append(_to_agenda_item(event, occ))

    # Nach Datum sortieren
    items.sort(key=lambda x: x.date)
    return items


def _to_agenda_item(event: CalendarEvent, date: datetime) -> AgendaItem:
    """Konvertiert ein Event + konkretes Datum zu einem AgendaItem."""
    return AgendaItem(
        event_id=event.id,
        title=event.title,
        description=event.description,
        date=date,
        end_time=event.end_time,
        all_day=event.all_day,
        color=event.color,
        is_recurring=event.recurrence != "none",
    )


def _expand_recurrence(
    event: CalendarEvent, range_start: datetime, range_end: datetime
) -> list[datetime]:
    """Berechnet alle Vorkommen eines wiederkehrenden Events im Zeitraum."""
    occurrences: list[datetime] = []
    current = event.start_time

    # Maximales Ende: recurrence_end oder range_end
    rec_end = min(range_end, event.recurrence_end) if event.recurrence_end else range_end

    # Delta pro Wiederholungstyp
    while current < rec_end:
        if current >= range_start:
            occurrences.append(current)
        current = _next_occurrence(current, event.recurrence)
        # Sicherheit: Abbruch nach 400 Iterationen (> 1 Jahr täglich)
        if len(occurrences) > 400:
            break
    return occurrences


def _next_occurrence(current: datetime, recurrence: str) -> datetime:
    """Berechnet das nächste Vorkommen basierend auf Wiederholungstyp."""
    if recurrence == "daily":
        return current + timedelta(days=1)
    elif recurrence == "weekly":
        return current + timedelta(weeks=1)
    elif recurrence == "monthly":
        # Nächster Monat, gleicher Tag (mit Überlauf-Schutz)
        month = current.month + 1
        year = current.year
        if month > 12:
            month = 1
            year += 1
        day = min(current.day, _days_in_month(year, month))
        return current.replace(year=year, month=month, day=day)
    elif recurrence == "yearly":
        # Nächstes Jahr, gleicher Tag (Schaltjahr-Schutz)
        year = current.year + 1
        day = min(current.day, _days_in_month(year, current.month))
        return current.replace(year=year, day=day)
    return current + timedelta(days=1)


def _days_in_month(year: int, month: int) -> int:
    """Gibt die Anzahl Tage im Monat zurück."""
    if month == 12:
        return 31
    return (datetime(year, month + 1, 1) - datetime(year, month, 1)).days