# Git Tracker — GitHub Commit-Kalender + Zeittracking
# Holt Commits via GitHub Events API (kein Token für Public Repos)
# Cached in SQLite, liefert Tages-Statistiken für den Kalender

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
import httpx

from backend.models.database import get_db
from backend.models.git_commit import GitCommit
from backend.infra.config import GITHUB_USERNAME

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/git", tags=["git"])

# Letzter Sync-Zeitpunkt (In-Memory Cache)
_last_sync: datetime | None = None
SYNC_INTERVAL = timedelta(hours=1)


async def _fetch_github_events(db: Session):
    """Holt PushEvents von GitHub und speichert neue Commits."""
    global _last_sync
    now = datetime.utcnow()
    if _last_sync and (now - _last_sync) < SYNC_INTERVAL:
        return  # Noch nicht fällig

    logger.info(f"GitHub Events sync für {GITHUB_USERNAME}...")
    page = 1
    new_count = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        while page <= 5:  # Max 5 Seiten (150 Events)
            resp = await client.get(
                f"https://api.github.com/users/{GITHUB_USERNAME}/events",
                params={"per_page": 30, "page": page},
                headers={"Accept": "application/vnd.github+json"},
            )
            if resp.status_code != 200:
                logger.warning(f"GitHub API Fehler: {resp.status_code}")
                break

            events = resp.json()
            if not events:
                break

            for event in events:
                if event.get("type") != "PushEvent":
                    continue
                repo_name = event.get("repo", {}).get("name", "").split("/")[-1]
                for commit in event.get("payload", {}).get("commits", []):
                    sha = commit.get("sha")
                    if not sha:
                        continue
                    # Deduplizierung via SHA
                    exists = db.query(GitCommit).filter(
                        GitCommit.sha == sha
                    ).first()
                    if exists:
                        continue
                    db.add(GitCommit(
                        sha=sha,
                        repo=repo_name,
                        message=(commit.get("message", "")[:200]),
                        committed_at=datetime.fromisoformat(
                            event["created_at"].replace("Z", "+00:00")
                        ),
                        author=commit.get("author", {}).get("name", ""),
                    ))
                    new_count += 1

            page += 1

    if new_count > 0:
        db.commit()
        logger.info(f"{new_count} neue Commits gespeichert")
    _last_sync = now


@router.get("/commits")
async def get_commits(
    month: str = Query(..., description="Format: YYYY-MM"),
    db: Session = Depends(get_db),
):
    """
    Tages-Statistiken für einen Monat.
    Gibt pro Tag: commit_count, repos, first_commit, last_commit zurück.
    """
    # Sync wenn nötig
    await _fetch_github_events(db)

    try:
        year, mon = int(month[:4]), int(month[5:7])
    except (ValueError, IndexError):
        return {"error": "Format: YYYY-MM"}

    # Commits für den Monat laden
    commits = db.query(GitCommit).filter(
        extract("year", GitCommit.committed_at) == year,
        extract("month", GitCommit.committed_at) == mon,
    ).order_by(GitCommit.committed_at).all()

    # Pro Tag gruppieren
    days: dict[str, dict] = {}
    for c in commits:
        day_key = c.committed_at.strftime("%Y-%m-%d")
        if day_key not in days:
            days[day_key] = {
                "date": day_key,
                "count": 0,
                "repos": set(),
                "first": c.committed_at.isoformat(),
                "last": c.committed_at.isoformat(),
                "commits": [],
            }
        d = days[day_key]
        d["count"] += 1
        d["repos"].add(c.repo)
        d["last"] = c.committed_at.isoformat()
        d["commits"].append({
            "sha": c.sha[:7],
            "repo": c.repo,
            "message": c.message,
            "time": c.committed_at.strftime("%H:%M"),
        })

    # Sets in Listen konvertieren + Arbeitszeit berechnen
    result = []
    for d in days.values():
        first = datetime.fromisoformat(d["first"])
        last = datetime.fromisoformat(d["last"])
        hours = (last - first).total_seconds() / 3600
        result.append({
            "date": d["date"],
            "count": d["count"],
            "repos": sorted(d["repos"]),
            "first_commit": d["first"],
            "last_commit": d["last"],
            "work_hours": round(hours, 1),
            "commits": d["commits"],
        })

    return {"month": month, "days": result}


@router.post("/sync")
async def force_sync(db: Session = Depends(get_db)):
    """Manueller Sync — ignoriert den Stunden-Cache."""
    global _last_sync
    _last_sync = None
    await _fetch_github_events(db)
    count = db.query(func.count(GitCommit.id)).scalar()
    return {"synced": True, "total_commits": count}
