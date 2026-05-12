"""Offline-Smoke-Test fuer Calendar-Tools mit Recurrence-Edge-Cases."""
import sys
import types
import os
from datetime import datetime, timedelta

# Stubs
sys.modules["backend"] = types.ModuleType("backend")
sys.modules["backend.models"] = types.ModuleType("backend.models")
sys.modules["backend.models.registry"] = types.ModuleType("backend.models.registry")

from sqlalchemy import Column, Integer, String, DateTime, Boolean, create_engine, func
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    all_day = Column(Boolean, default=False, nullable=False)
    color = Column(String, default="cyan", nullable=False)
    recurrence = Column(String, default="none", nullable=False)
    recurrence_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


cal_mod = types.ModuleType("backend.models.calendar_event")
cal_mod.CalendarEvent = CalendarEvent
sys.modules["backend.models.calendar_event"] = cal_mod

# Skript-Pfad fuer Test im Repo (./scripts/tests/) — fuer Sandbox: nicht relevant
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2] / "backend" / "services"))
import delphi_tools_calendar as ct

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
db = Session()


def add(title, start, recurrence="none", rec_end=None, description=None, all_day=False):
    e = CalendarEvent(
        title=title, start_time=start, recurrence=recurrence,
        recurrence_end=rec_end, description=description, all_day=all_day,
    )
    db.add(e)


# Test-Daten:
# 1) Einmaliger Termin
add("Hinkelmann Meeting", datetime(2026, 3, 15, 14, 0),
    description="Diskussion Pallas Konzept")
# 2) Wochentlich Uni (Dienstag, kein Ende)
add("Uni Vorlesung", datetime(2026, 2, 3, 10, 0), recurrence="weekly")
# 3) Wochentlich Sport, mit Ende
add("Krafttraining", datetime(2026, 1, 5, 18, 0), recurrence="weekly",
    rec_end=datetime(2026, 6, 30))
# 4) Monatlich Arzt
add("Hausarzt Kontrolle", datetime(2026, 2, 10, 9, 0), recurrence="monthly")
# 5) Ganztaegig Geburtstag (yearly)
add("Mama Geburtstag", datetime(2025, 5, 15), recurrence="yearly", all_day=True,
    description="Geschenk besorgen!")
# 6) Termin nach today
add("Zukuenftiges Hinkelmann", datetime(2027, 1, 10, 15, 0),
    description="Folgetermin")

db.commit()


def section(t):
    print("\n" + "=" * 70)
    print(t)
    print("=" * 70)


# --- 1: in_period ---
section("Tool 1: events_in_period Maerz 2026")
print(ct.calendar_events_in_period(db, "2026-03-01", "2026-03-31"))

section("Tool 1: events_in_period mit query='Hinkelmann'")
print(ct.calendar_events_in_period(db, "2026-01-01", "2027-12-31", query="Hinkelmann"))

section("Tool 1: events_in_period nur Sport, 6 Monate")
print(ct.calendar_events_in_period(db, "2026-01-01", "2026-06-30", query="Kraft"))

section("Tool 1: leerer Zeitraum")
print(ct.calendar_events_in_period(db, "2020-01-01", "2020-01-31"))

section("Tool 1: ungueltiges Datum")
print(ct.calendar_events_in_period(db, "garbage", "2026-01-01"))

# --- 2: search ---
section("Tool 2: search 'Uni'")
print(ct.calendar_search_events(db, "Uni"))

section("Tool 2: search 'Geburtstag' (Description-Match)")
print(ct.calendar_search_events(db, "Geschenk"))

section("Tool 2: search 'nirgends'")
print(ct.calendar_search_events(db, "nirgends"))

# --- 3: next_event ---
section("Tool 3: next_event")
print(ct.calendar_next_event(db))

section("Tool 3: next_event query='Arzt'")
print(ct.calendar_next_event(db, query="Arzt"))

section("Tool 3: next_event query='zukuenftig' (wuerde nichts finden ausser Hinkelmann 2027)")
print(ct.calendar_next_event(db, query="zukuenftig"))

section("Tool 3: next_event query='nichts'")
print(ct.calendar_next_event(db, query="nichts"))

# --- 4: frequency ---
section("Tool 4: frequency Krafttraining Jan-Juli 2026, week")
print(ct.calendar_event_frequency(
    db, "2026-01-01", "2026-07-31", query="Kraft", group_by="week"
))

section("Tool 4: frequency Uni Feb-Mai 2026, day")
print(ct.calendar_event_frequency(
    db, "2026-02-01", "2026-05-31", query="Uni", group_by="day"
))

section("Tool 4: frequency ALL events 2026, month")
print(ct.calendar_event_frequency(db, "2026-01-01", "2026-12-31", group_by="month"))

# --- Dispatcher ---
section("Dispatcher: execute_calendar_tool('calendar_next_event', {}, db)")
print(ct.execute_calendar_tool("calendar_next_event", {}, db))

section("Dispatcher: unknown")
print(ct.execute_calendar_tool("calendar_nonsense", {}, db))

# --- Recurrence-Bomb-Check ---
section("Edge-Case: daily ohne Ende ueber 5 Jahre (Loop-Cap-Test)")
db.add(CalendarEvent(
    title="Daily Pillenservice", start_time=datetime(2025, 1, 1, 7, 0),
    recurrence="daily",
))
db.commit()
result = ct.calendar_events_in_period(db, "2025-01-01", "2030-12-31", query="Pillen")
# Erwartet: gedeckelt bei MAX_RECURRENCE_INSTANCES=500
print(result[:500])
print("...")
print(result[-200:])

print("\n" + "=" * 70)
print("ALL TESTS COMPLETED — no exceptions raised.")
print("=" * 70)
