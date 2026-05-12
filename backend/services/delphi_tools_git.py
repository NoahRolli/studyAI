"""Delphi Git-Tools — B-Track Aggregat-Operationen auf der GitCommit-Tabelle.

Liest aus der lokalen git_commits-Tabelle (befuellt von backend.api.git_tracker
via GitHub Repos+Commits API, 1h-Sync). Kein Network-Call hier, alle Daten
sind bereits gecacht.

Trennung von delphi_tools.py: Das B-Track-Header-Kommentar in delphi_tools.py
schliesst Git-Daten explizit aus V1 aus. Hier ist V2-B.

Stil-Konventionen (parallel zu delphi_tools.py):
- Sync-Funktionen (keine Embedding-Calls, kein await noetig)
- Signatur (db, *args) -> str
- Anker-Format fuer Citations: [git:{sha7}@{repo}] — der LLM kann den
  in einer Antwort als [Sx] markieren, der Frontend-Highlighter zeigt
  Commit-Link.
- Bei nicht-gefundenem Repo: Hinweis-String, kein Raise — execute_tool
  wuerde sonst die Exception-Message in den Tool-Result-Slot stopfen,
  was den LLM verwirrt.
"""

import logging
from datetime import datetime, timedelta, timezone
from collections import Counter
from sqlalchemy.orm import Session
from sqlalchemy import func

import backend.models.registry  # noqa: F401  Lazy-loads ALLE Models

from backend.models.git_commit import GitCommit

logger = logging.getLogger(__name__)


# ---------- Konfig ----------
SEARCH_LIMIT_DEFAULT = 10
SEARCH_LIMIT_MAX = 50
PERIOD_LIST_MAX = 100   # Kappung bei get_commits_in_period
HISTOGRAM_GAP_FILL = True


# ---------- Helper ----------
def _fmt_date(dt: datetime) -> str:
    """ISO-Datum ohne Uhrzeit, LLM-freundlich."""
    if dt is None:
        return "?"
    return dt.strftime("%Y-%m-%d")


def _fmt_datetime(dt: datetime) -> str:
    """ISO-Datum mit Uhrzeit, fuer Commit-Listen."""
    if dt is None:
        return "?"
    return dt.strftime("%Y-%m-%d %H:%M")


def _parse_iso(date_str: str) -> datetime | None:
    """Toleranter ISO-Parser fuer YYYY-MM-DD oder mit Uhrzeit."""
    if not date_str:
        return None
    try:
        # Wenn nur Datum, ans Tagesende auffuellen damit "bis 2026-04-15" inklusive ist
        if "T" not in date_str and " " not in date_str:
            return datetime.fromisoformat(date_str)
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _short_anchor(sha: str, repo: str) -> str:
    """Citation-Anker fuer Commits: [git:abc1234@pallas]."""
    return f"[git:{sha[:7]}@{repo}]"


def _repo_filter(query, repo: str | None):
    """Append optional repo filter to a query."""
    if repo:
        return query.filter(GitCommit.repo == repo)
    return query


def _verify_repo_exists(db: Session, repo: str) -> bool:
    """Pruefen ob ein Repo-Name in der DB existiert (case-sensitive)."""
    return db.query(GitCommit.id).filter(GitCommit.repo == repo).first() is not None


# ---------- Tool 1: First Commit ----------
def git_first_commit(db: Session, repo: str | None = None) -> str:
    """Aeltester bekannter Commit (global oder pro Repo).

    Liest aus git_commits — also nur Commits die nach Pallas-Inbetriebnahme
    via GitHub-Sync importiert wurden. Aeltere Commits davor sind nicht
    erfasst (GitHub-API liefert nur die letzten ~90 Tage neu, der Rest
    wurde durch sukzessive Syncs gesammelt). Diese Limitierung explizit
    im Output ausweisen.
    """
    q = _repo_filter(db.query(GitCommit), repo)
    if repo and not _verify_repo_exists(db, repo):
        return f"Repo '{repo}' nicht in der lokalen Commit-Datenbank. Sync evtl. noch nicht durch."

    first = q.order_by(GitCommit.committed_at.asc()).first()
    if first is None:
        return "Keine Commits in der lokalen Datenbank."

    scope = f"Repo '{repo}'" if repo else "alle Repos"
    return (
        f"Erster bekannter Commit ({scope}):\n"
        f"  Datum: {_fmt_datetime(first.committed_at)}\n"
        f"  Repo: {first.repo}\n"
        f"  Message: {first.message[:120] if first.message else ''}\n"
        f"  Anker: {_short_anchor(first.sha, first.repo)}\n"
        f"\n"
        f"Hinweis: Lokale DB enthaelt nur Commits ab Inbetriebnahme der "
        f"GitHub-Sync-Pipeline. Aeltere Commits davor sind ggf. nicht erfasst."
    )


# ---------- Tool 2: Commits in Period ----------
def git_commits_in_period(
    db: Session,
    start_date: str,
    end_date: str,
    repo: str | None = None,
) -> str:
    """Liste der Commits in einem Zeitraum (inklusive Grenzen).

    Bei mehr als PERIOD_LIST_MAX gibt's eine Top-Zeile mit Total und
    nur die ersten N detailliert. Pro-Repo-Breakdown am Ende.
    """
    start = _parse_iso(start_date)
    end = _parse_iso(end_date)
    if start is None or end is None:
        return f"Ungueltige Datumsangabe (start='{start_date}', end='{end_date}'). Format YYYY-MM-DD."
    # end inklusive Tagesende
    if end.hour == 0 and end.minute == 0 and end.second == 0:
        end = end + timedelta(days=1) - timedelta(seconds=1)

    if repo and not _verify_repo_exists(db, repo):
        return f"Repo '{repo}' nicht in der lokalen Commit-Datenbank."

    q = db.query(GitCommit).filter(
        GitCommit.committed_at >= start,
        GitCommit.committed_at <= end,
    )
    q = _repo_filter(q, repo)

    total = q.count()
    if total == 0:
        scope = f" in Repo '{repo}'" if repo else ""
        return (
            f"Keine Commits zwischen {_fmt_date(start)} und {_fmt_date(end)}{scope}."
        )

    commits = q.order_by(GitCommit.committed_at.asc()).limit(PERIOD_LIST_MAX).all()

    # Per-Repo-Breakdown
    repo_counts: Counter = Counter()
    for c in commits:
        repo_counts[c.repo] += 1
    # Wenn limited: zaehl auch die nicht-angezeigten fuer korrekte Breakdown
    if total > PERIOD_LIST_MAX:
        for r, cnt in (
            db.query(GitCommit.repo, func.count(GitCommit.id))
            .filter(GitCommit.committed_at >= start, GitCommit.committed_at <= end)
            .group_by(GitCommit.repo).all()
        ):
            repo_counts[r] = cnt

    scope = f" in Repo '{repo}'" if repo else ""
    lines = [
        f"Commits zwischen {_fmt_date(start)} und {_fmt_date(end)}{scope}: {total}",
        "",
    ]
    if not repo and len(repo_counts) > 1:
        lines.append("Per Repo:")
        for r, cnt in sorted(repo_counts.items(), key=lambda x: -x[1]):
            lines.append(f"  - {r}: {cnt}")
        lines.append("")
    lines.append(f"Liste (max {PERIOD_LIST_MAX}, aelteste zuerst):")
    for c in commits:
        msg = (c.message or "").split("\n", 1)[0][:80]
        lines.append(
            f"  {_fmt_datetime(c.committed_at)} {_short_anchor(c.sha, c.repo)} {msg}"
        )
    if total > PERIOD_LIST_MAX:
        lines.append(f"  ... + {total - PERIOD_LIST_MAX} weitere (gekuerzt)")
    return "\n".join(lines)


# ---------- Tool 3: Commit Frequency ----------
def git_commit_frequency(
    db: Session,
    start_date: str,
    end_date: str,
    group_by: str = "day",
    repo: str | None = None,
) -> str:
    """Haeufigkeits-Histogramm: Commits pro Tag/Woche/Monat.

    Macht Bursts sichtbar (z.B. 'in welcher Woche habe ich viel gemacht').
    Luecken werden als 0 eingetragen damit der Verlauf sichtbar bleibt.
    """
    if group_by not in ("day", "week", "month"):
        return f"Ungueltiges group_by='{group_by}'. Erlaubt: day, week, month."

    start = _parse_iso(start_date)
    end = _parse_iso(end_date)
    if start is None or end is None:
        return f"Ungueltige Datumsangabe. Format YYYY-MM-DD."
    if end.hour == 0 and end.minute == 0 and end.second == 0:
        end = end + timedelta(days=1) - timedelta(seconds=1)

    if repo and not _verify_repo_exists(db, repo):
        return f"Repo '{repo}' nicht in der lokalen Commit-Datenbank."

    q = db.query(GitCommit).filter(
        GitCommit.committed_at >= start,
        GitCommit.committed_at <= end,
    )
    q = _repo_filter(q, repo)
    rows = q.all()

    if not rows:
        return f"Keine Commits zwischen {_fmt_date(start)} und {_fmt_date(end)}."

    def _bucket_key(dt: datetime) -> str:
        if group_by == "day":
            return dt.strftime("%Y-%m-%d")
        if group_by == "month":
            return dt.strftime("%Y-%m")
        # week: ISO-week
        y, w, _ = dt.isocalendar()
        return f"{y}-W{w:02d}"

    counts: Counter = Counter()
    for r in rows:
        counts[_bucket_key(r.committed_at)] += 1

    # Gap-Fill: Buckets zwischen start und end mit 0 ergaenzen
    filled: dict[str, int] = {}
    if HISTOGRAM_GAP_FILL:
        cur = start
        while cur <= end:
            filled[_bucket_key(cur)] = counts.get(_bucket_key(cur), 0)
            if group_by == "day":
                cur = cur + timedelta(days=1)
            elif group_by == "week":
                cur = cur + timedelta(days=7)
            else:  # month
                # naechster Monatsbeginn
                if cur.month == 12:
                    cur = cur.replace(year=cur.year + 1, month=1, day=1)
                else:
                    cur = cur.replace(month=cur.month + 1, day=1)
    else:
        filled = dict(counts)

    sorted_keys = sorted(filled.keys())
    total = sum(filled.values())
    active_buckets = sum(1 for v in filled.values() if v > 0)
    max_val = max(filled.values()) if filled else 0

    scope = f", Repo '{repo}'" if repo else ""
    lines = [
        f"Commit-Frequenz {_fmt_date(start)} - {_fmt_date(end)} (group_by={group_by}{scope}):",
        f"  Total Commits: {total}",
        f"  Aktive {group_by}s: {active_buckets}/{len(filled)}",
        f"  Peak: {max_val} pro {group_by}",
        "",
        f"Verteilung (max {len(sorted_keys)} Buckets):",
    ]
    # ASCII-Bar in 20 Stellen
    for k in sorted_keys:
        v = filled[k]
        if max_val > 0:
            bar = "#" * max(1, int(round(20 * v / max_val))) if v > 0 else ""
        else:
            bar = ""
        lines.append(f"  {k}: {v:>3d}  {bar}")
    return "\n".join(lines)


# ---------- Tool 4: Search Commits ----------
def git_search_commits(
    db: Session,
    query: str,
    repo: str | None = None,
    limit: int = SEARCH_LIMIT_DEFAULT,
) -> str:
    """Volltext-Suche in Commit-Messages (case-insensitive LIKE).

    Sucht nach query-String in message-Spalte. Bei mehreren Treffern
    werden die juengsten zuerst gezeigt. Kein Embedding-Match — pures
    SQL-LIKE, also keyword-getrieben. Fuer thematische Aehnlichkeit
    waere get_topic_timeline besser.
    """
    q = (query or "").strip()
    if not q:
        return "Leere Suchanfrage."
    limit = max(1, min(int(limit or SEARCH_LIMIT_DEFAULT), SEARCH_LIMIT_MAX))

    if repo and not _verify_repo_exists(db, repo):
        return f"Repo '{repo}' nicht in der lokalen Commit-Datenbank."

    base = db.query(GitCommit).filter(GitCommit.message.ilike(f"%{q}%"))
    base = _repo_filter(base, repo)

    total = base.count()
    if total == 0:
        scope = f" in Repo '{repo}'" if repo else ""
        return f"Keine Commits mit '{q}' in der Message gefunden{scope}."

    commits = base.order_by(GitCommit.committed_at.desc()).limit(limit).all()

    # Per-Repo Breakdown wenn kein expliziter Filter
    repo_counts: Counter = Counter()
    if not repo:
        for r, cnt in (
            db.query(GitCommit.repo, func.count(GitCommit.id))
            .filter(GitCommit.message.ilike(f"%{q}%"))
            .group_by(GitCommit.repo).all()
        ):
            repo_counts[r] = cnt

    scope = f" in Repo '{repo}'" if repo else ""
    lines = [
        f"Commit-Search '{q}'{scope}: {total} Treffer.",
        "",
    ]
    if not repo and len(repo_counts) > 1:
        lines.append("Per Repo:")
        for r, cnt in sorted(repo_counts.items(), key=lambda x: -x[1]):
            lines.append(f"  - {r}: {cnt}")
        lines.append("")
    lines.append(f"Top {len(commits)} (neueste zuerst):")
    for c in commits:
        msg = (c.message or "").split("\n", 1)[0][:100]
        lines.append(
            f"  {_fmt_datetime(c.committed_at)} {_short_anchor(c.sha, c.repo)} {msg}"
        )
    if total > limit:
        lines.append(f"  ... + {total - limit} weitere (gekuerzt)")
    return "\n".join(lines)


# ---------- Tool 5: Repo Stats ----------
def git_repo_stats(db: Session, repo: str | None = None) -> str:
    """Statistik pro Repo: Total Commits, First, Last, Aktive Tage, Tagesschnitt.

    Ohne repo-Filter: alle Repos mit aggregierten Werten je Repo.
    Mit repo-Filter: detaillierte Stats fuer ein Repo.
    """
    if repo and not _verify_repo_exists(db, repo):
        return f"Repo '{repo}' nicht in der lokalen Commit-Datenbank."

    # Aggregat-Query: per Repo
    rows = (
        db.query(
            GitCommit.repo,
            func.count(GitCommit.id),
            func.min(GitCommit.committed_at),
            func.max(GitCommit.committed_at),
        )
        .group_by(GitCommit.repo)
        .all()
    )
    if not rows:
        return "Keine Commits in der lokalen Datenbank."

    if repo:
        rows = [r for r in rows if r[0] == repo]

    # Aktive Tage pro Repo separat zaehlen (DISTINCT date)
    active_days_by_repo: dict[str, int] = {}
    for r in rows:
        rname = r[0]
        # SQLite: DATE() extrahiert nur den Tag
        cnt = db.query(
            func.count(func.distinct(func.date(GitCommit.committed_at)))
        ).filter(GitCommit.repo == rname).scalar()
        active_days_by_repo[rname] = int(cnt or 0)

    # Sort: nach Total absteigend
    rows.sort(key=lambda r: -r[1])

    if repo:
        r = rows[0]
        rname, total, first, last = r
        active_days = active_days_by_repo.get(rname, 0)
        span_days = max(1, (last - first).days) if first and last else 1
        return (
            f"Repo '{rname}' — Statistik:\n"
            f"  Total Commits: {total}\n"
            f"  Erster Commit: {_fmt_datetime(first)}\n"
            f"  Letzter Commit: {_fmt_datetime(last)}\n"
            f"  Aktive Tage: {active_days}\n"
            f"  Spanne: {span_days} Tage\n"
            f"  Schnitt: {total / span_days:.2f} Commits/Tag (Spanne), "
            f"{total / max(1, active_days):.2f} Commits/aktivem Tag"
        )

    # Alle Repos uebersicht
    lines = [
        f"Repo-Statistik ({len(rows)} Repos):",
        "",
        f"{'Repo':<25} {'Commits':>8} {'Tage':>6} {'Erster':>12} {'Letzter':>12}",
        "-" * 70,
    ]
    grand_total = 0
    for rname, total, first, last in rows:
        ad = active_days_by_repo.get(rname, 0)
        lines.append(
            f"{rname[:24]:<25} {total:>8} {ad:>6} "
            f"{_fmt_date(first):>12} {_fmt_date(last):>12}"
        )
        grand_total += total
    lines.append("-" * 70)
    lines.append(f"{'TOTAL':<25} {grand_total:>8}")
    return "\n".join(lines)


# ---------- Dispatcher ----------
def execute_git_tool(name: str, args: dict, db: Session) -> str:
    """Dispatch fuer Git-Tools. Wird von delphi_tools.execute_tool gerufen.

    Sync — execute_tool() ist async, ruft aber nur Sync-Branch ohne await.
    """
    if name == "git_first_commit":
        return git_first_commit(db, **args)
    if name == "git_commits_in_period":
        return git_commits_in_period(db, **args)
    if name == "git_commit_frequency":
        return git_commit_frequency(db, **args)
    if name == "git_search_commits":
        return git_search_commits(db, **args)
    if name == "git_repo_stats":
        return git_repo_stats(db, **args)
    return f"Unbekanntes Git-Tool: {name}"
