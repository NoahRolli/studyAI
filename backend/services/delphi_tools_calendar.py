"""Delphi Calendar-Tools — B-Track Aggregat-Operationen auf calendar_events.

Liest aus der calendar_events-Tabelle (Hauptkalender, plain SQLite,
keine Verschluesselung — separate Domaene vom Journal).

Trennung von delphi_tools.py: Wie git-tools nicht V1, sondern V2-B.

Stil-Konventionen (parallel zu delphi_tools_git.py):
- Sync-Funktionen (keine Embedding-Calls)
- Signatur (db, *args) -> str
- Anker-Format fuer Citations: [cal:{event_id}] oder [cal:{id}#{occurrence_date}]
  bei wiederkehrenden Events
- Recurrence wird im Tool selbst expandiert — Frontend macht das auch,
  aber der LLM braucht die Instanzen, nicht die Rule

Wichtig zur Recurrence-Expansion:
- recurrence='none' -> 1 Instanz am start_time
- recurrence='daily/weekly/monthly/yearly' -> Schleife von start_time
  bis recurrence_end (oder Such-Window-Ende falls recurrence_end NULL)
- Hard-Cap MAX_RECURRENCE_INSTANCES verhindert Loop-Bomb bei
  daily-ohne-Ende + grossem Such-Window
"""

import logging
from datetime import datetime, timedelta, timezone
from collections import Counter
from calendar import monthrange
from sqlalchemy.orm import Session
from sqlalchemy import or_

import backend.models.registry  # noqa: F401  Lazy-loads ALLE Models

from backend.models.calendar_event import CalendarEvent

logger = logging.getLogger(__name__)


# ---------- Konfig ----------
SEARCH_LIMIT_DEFAULT = 10
SEARCH_LIMIT_MAX = 50
PERIOD_LIST_MAX = 100
MAX_RECURRENCE_INSTANCES = 500  # Pro Base-Event, gegen Loop-Bomb


# ---------- Helper ----------
def _fmt_date(dt: datetime) -> str:
    if dt is None:
        return "?"
    return dt.strftime("%Y-%m-%d")


def _fmt_datetime(dt: datetime, all_day: bool = False) -> str:
    """ISO-Datum optional mit Uhrzeit. Bei all_day nur das Datum."""
    if dt is None:
        return "?"
    if all_day:
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d %H:%M")


def _parse_iso(date_str: str) -> datetime | None:
    if not date_str:
        return None
    try:
        if "T" not in date_str and " " not in date_str:
            return datetime.fromisoformat(date_str)
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _short_anchor(event_id: int, occurrence_date: datetime | None = None) -> str:
    """Citation-Anker fuer Calendar-Events: [cal:42] oder [cal:42#2026-05-12]."""
    if occurrence_date is None:
        return f"[cal:{event_id}]"
    return f"[cal:{event_id}#{occurrence_date.strftime('%Y-%m-%d')}]"


def _advance(dt: datetime, recurrence: str) -> datetime | None:
    """Naechste Instanz fuer eine Recurrence-Rule.

    Returns None bei 'none' oder unbekanntem Wert.
    """
    if recurrence == "daily":
        return dt + timedelta(days=1)
    if recurrence == "weekly":
        return dt + timedelta(days=7)
    if recurrence == "monthly":
        # Naechster Monat, gleiche Tag-Nummer (capped wenn Februar etc.)
        y = dt.year + (1 if dt.month == 12 else 0)
        m = 1 if dt.month == 12 else dt.month + 1
        max_d = monthrange(y, m)[1]
        return dt.replace(year=y, month=m, day=min(dt.day, max_d))
    if recurrence == "yearly":
        # Schaltjahr-Edge: 29.02. -> 28.02. in Nicht-Schaltjahren
        try:
            return dt.replace(year=dt.year + 1)
        except ValueError:
            return dt.replace(year=dt.year + 1, day=28)
    return None


def _expand_event(
    event: CalendarEvent,
    window_start: datetime,
    window_end: datetime,
) -> list[tuple[datetime, bool]]:
    """Expandiert ein Event in Liste (occurrence_datetime, is_recurring).

    Filtert auf das Such-Window. Bei recurrence='none' max 1 Eintrag.
    Hard-Cap MAX_RECURRENCE_INSTANCES verhindert Loop-Bomb.
    """
    instances: list[tuple[datetime, bool]] = []
    cur = event.start_time
    if cur is None:
        return instances

    is_recurring = event.recurrence and event.recurrence != "none"

    # Recurrence-Ende: explizit oder Such-Window-Ende
    rec_end = event.recurrence_end if event.recurrence_end else window_end
    # Effective end: minimum aus recurrence_end und window_end
    effective_end = min(rec_end, window_end)

    count = 0
    while cur <= effective_end and count < MAX_RECURRENCE_INSTANCES:
        if cur >= window_start:
            instances.append((cur, is_recurring))
        if not is_recurring:
            break  # nur 1 Instanz bei 'none'
        next_cur = _advance(cur, event.recurrence)
        if next_cur is None or next_cur <= cur:
            break  # defensive
        cur = next_cur
        count += 1

    return instances


def _match_query(event: CalendarEvent, query: str | None) -> bool:
    """Case-insensitive Substring-Match in title+description."""
    if not query:
        return True
    q = query.lower()
    if event.title and q in event.title.lower():
        return True
    if event.description and q in event.description.lower():
        return True
    return False


# ---------- Tool 1: Events in Period ----------
def calendar_events_in_period(
    db: Session,
    start_date: str,
    end_date: str,
    query: str | None = None,
) -> str:
    """Events in einem Zeitraum, inkl. expandierter Recurrence-Instanzen.

    query optional: Substring-Filter auf title/description.
    """
    start = _parse_iso(start_date)
    end = _parse_iso(end_date)
    if start is None or end is None:
        return f"Ungueltige Datumsangabe (start='{start_date}', end='{end_date}'). Format YYYY-MM-DD."
    if end.hour == 0 and end.minute == 0 and end.second == 0:
        end = end + timedelta(days=1) - timedelta(seconds=1)

    # Alle Events laden deren Rule moeglicherweise in unseren Zeitraum faellt.
    # Bei recurrence != 'none' kann start_time vor window_start liegen,
    # aber Instanzen drin sein. Konservativ: alle Events deren start_time
    # <= window_end (sonst start nach unserem Fenster - kein Match moeglich
    # ausser bei recurrence, aber recurrence start ist start_time selbst)
    events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.start_time <= end)
        .order_by(CalendarEvent.start_time.asc())
        .all()
    )

    # Recurrence expandieren + Query-Filter + Window-Filter
    instances: list[tuple[CalendarEvent, datetime, bool]] = []
    for ev in events:
        if not _match_query(ev, query):
            continue
        for occ_dt, is_rec in _expand_event(ev, start, end):
            instances.append((ev, occ_dt, is_rec))

    # Sortiere nach Datum
    instances.sort(key=lambda x: x[1])

    if not instances:
        scope = f" mit '{query}'" if query else ""
        return f"Keine Events zwischen {_fmt_date(start)} und {_fmt_date(end)}{scope}."

    total = len(instances)
    scope = f", Filter '{query}'" if query else ""
    lines = [
        f"Events {_fmt_date(start)} - {_fmt_date(end)}{scope}: {total}",
        "",
        f"Liste (max {PERIOD_LIST_MAX}, chronologisch):",
    ]
    for ev, occ_dt, is_rec in instances[:PERIOD_LIST_MAX]:
        rec_marker = " (recurring)" if is_rec else ""
        anchor = _short_anchor(ev.id, occ_dt if is_rec else None)
        desc = f" — {ev.description[:60]}" if ev.description else ""
        lines.append(
            f"  {_fmt_datetime(occ_dt, ev.all_day)} {anchor} {ev.title[:60]}{rec_marker}{desc}"
        )
    if total > PERIOD_LIST_MAX:
        lines.append(f"  ... + {total - PERIOD_LIST_MAX} weitere (gekuerzt)")
    return "\n".join(lines)


# ---------- Tool 2: Search Events ----------
def calendar_search_events(
    db: Session,
    query: str,
    limit: int = SEARCH_LIMIT_DEFAULT,
) -> str:
    """Volltext-Suche in title + description.

    Sucht alle Events (auch wiederkehrende Rules), gibt Base-Events zurueck
    sortiert nach letztem start_time absteigend (juengste zuerst).
    """
    q = (query or "").strip()
    if not q:
        return "Leere Suchanfrage."
    limit = max(1, min(int(limit or SEARCH_LIMIT_DEFAULT), SEARCH_LIMIT_MAX))

    base = db.query(CalendarEvent).filter(
        or_(
            CalendarEvent.title.ilike(f"%{q}%"),
            CalendarEvent.description.ilike(f"%{q}%"),
        )
    )
    total = base.count()
    if total == 0:
        return f"Keine Events mit '{q}' im Titel oder Beschreibung gefunden."

    events = base.order_by(CalendarEvent.start_time.desc()).limit(limit).all()

    lines = [
        f"Event-Search '{q}': {total} Treffer.",
        "",
        f"Top {len(events)} (neueste zuerst):",
    ]
    for ev in events:
        rec_marker = ""
        if ev.recurrence and ev.recurrence != "none":
            rec_end = _fmt_date(ev.recurrence_end) if ev.recurrence_end else "kein Ende"
            rec_marker = f" [recurrence={ev.recurrence}, bis {rec_end}]"
        anchor = _short_anchor(ev.id)
        desc = f" — {ev.description[:80]}" if ev.description else ""
        lines.append(
            f"  {_fmt_datetime(ev.start_time, ev.all_day)} {anchor} "
            f"{ev.title[:80]}{rec_marker}{desc}"
        )
    if total > limit:
        lines.append(f"  ... + {total - limit} weitere (gekuerzt)")
    return "\n".join(lines)


# ---------- Tool 3: Next Event ----------
def calendar_next_event(
    db: Session,
    query: str | None = None,
    days_ahead: int = 365,
) -> str:
    """Naechstes anstehendes Event ab jetzt, optional gefiltert nach query.

    days_ahead: Such-Fenster fuer Recurrence-Expansion (default 1 Jahr).
    """
    now = datetime.now()
    window_end = now + timedelta(days=max(1, min(int(days_ahead or 365), 365 * 5)))

    events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.start_time <= window_end)
        .all()
    )

    candidates: list[tuple[CalendarEvent, datetime, bool]] = []
    for ev in events:
        if not _match_query(ev, query):
            continue
        for occ_dt, is_rec in _expand_event(ev, now, window_end):
            candidates.append((ev, occ_dt, is_rec))

    if not candidates:
        scope = f" mit '{query}'" if query else ""
        return f"Kein anstehendes Event{scope} innerhalb der naechsten {days_ahead} Tage."

    candidates.sort(key=lambda x: x[1])
    ev, occ_dt, is_rec = candidates[0]
    delta = occ_dt - now
    days = delta.days
    hours = delta.seconds // 3600

    if days > 0:
        time_until = f"in {days} Tag{'en' if days != 1 else ''}"
    elif hours > 0:
        time_until = f"in {hours} Stunde{'n' if hours != 1 else ''}"
    else:
        time_until = "in weniger als 1 Stunde"

    rec_marker = " (recurring)" if is_rec else ""
    anchor = _short_anchor(ev.id, occ_dt if is_rec else None)
    desc_line = f"\n  Beschreibung: {ev.description}" if ev.description else ""
    scope = f" (Filter '{query}')" if query else ""

    return (
        f"Naechstes Event{scope}: {time_until}\n"
        f"  Wann: {_fmt_datetime(occ_dt, ev.all_day)}{rec_marker}\n"
        f"  Titel: {ev.title}\n"
        f"  Anker: {anchor}"
        f"{desc_line}"
    )


# ---------- Tool 4: Frequency ----------
def calendar_event_frequency(
    db: Session,
    start_date: str,
    end_date: str,
    query: str | None = None,
    group_by: str = "week",
) -> str:
    """Haeufigkeit von Events pro Tag/Woche/Monat, optional gefiltert.

    Nuetzlich fuer 'wie oft habe ich X gemacht' Fragen.
    """
    if group_by not in ("day", "week", "month"):
        return f"Ungueltiges group_by='{group_by}'. Erlaubt: day, week, month."

    start = _parse_iso(start_date)
    end = _parse_iso(end_date)
    if start is None or end is None:
        return "Ungueltige Datumsangabe. Format YYYY-MM-DD."
    if end.hour == 0 and end.minute == 0 and end.second == 0:
        end = end + timedelta(days=1) - timedelta(seconds=1)

    events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.start_time <= end)
        .all()
    )

    def _bucket_key(dt: datetime) -> str:
        if group_by == "day":
            return dt.strftime("%Y-%m-%d")
        if group_by == "month":
            return dt.strftime("%Y-%m")
        y, w, _ = dt.isocalendar()
        return f"{y}-W{w:02d}"

    counts: Counter = Counter()
    total_instances = 0
    for ev in events:
        if not _match_query(ev, query):
            continue
        for occ_dt, _ in _expand_event(ev, start, end):
            counts[_bucket_key(occ_dt)] += 1
            total_instances += 1

    if total_instances == 0:
        scope = f" mit '{query}'" if query else ""
        return f"Keine Events zwischen {_fmt_date(start)} und {_fmt_date(end)}{scope}."

    # Gap-Fill
    filled: dict[str, int] = {}
    cur = start
    while cur <= end:
        filled[_bucket_key(cur)] = counts.get(_bucket_key(cur), 0)
        if group_by == "day":
            cur = cur + timedelta(days=1)
        elif group_by == "week":
            cur = cur + timedelta(days=7)
        else:
            if cur.month == 12:
                cur = cur.replace(year=cur.year + 1, month=1, day=1)
            else:
                cur = cur.replace(month=cur.month + 1, day=1)

    sorted_keys = sorted(filled.keys())
    active_buckets = sum(1 for v in filled.values() if v > 0)
    max_val = max(filled.values()) if filled else 0

    scope = f", Filter '{query}'" if query else ""
    lines = [
        f"Event-Frequenz {_fmt_date(start)} - {_fmt_date(end)} (group_by={group_by}{scope}):",
        f"  Total Instanzen: {total_instances}",
        f"  Aktive {group_by}s: {active_buckets}/{len(filled)}",
        f"  Peak: {max_val} pro {group_by}",
        "",
        f"Verteilung:",
    ]
    for k in sorted_keys:
        v = filled[k]
        bar = "#" * max(1, int(round(20 * v / max_val))) if v > 0 and max_val > 0 else ""
        lines.append(f"  {k}: {v:>3d}  {bar}")
    return "\n".join(lines)


# ---------- Dispatcher ----------
def execute_calendar_tool(name: str, args: dict, db: Session) -> str:
    """Dispatch fuer Calendar-Tools. Wird von delphi_tools.execute_tool gerufen."""
    if name == "calendar_events_in_period":
        return calendar_events_in_period(db, **args)
    if name == "calendar_search_events":
        return calendar_search_events(db, **args)
    if name == "calendar_next_event":
        return calendar_next_event(db, **args)
    if name == "calendar_event_frequency":
        return calendar_event_frequency(db, **args)
    return f"Unbekanntes Calendar-Tool: {name}"
