# Git Tracker — GitHub Commit-Kalender + Zeittracking
# Holt Commits via GitHub Repos+Commits API (kein Token für Public Repos)
# Cached in SQLite, 1x pro Stunde Sync

import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
import httpx

from backend.models.database import get_db
from backend.models.git_commit import GitCommit
from backend.infra.config import GITHUB_USERNAME

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/git", tags=["git"])

_last_sync: datetime | None = None
SYNC_INTERVAL = timedelta(hours=1)
GITHUB_API = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github+json"}


async def _fetch_commits(db: Session):
    """Holt Commits aller Public Repos und speichert neue."""
    global _last_sync
    now = datetime.now(timezone.utc)
    if _last_sync and (now - _last_sync) < SYNC_INTERVAL:
        return

    logger.info(f"GitHub Commits sync für {GITHUB_USERNAME}...")
    new_count = 0

    # Letzten bekannten Commit-Zeitpunkt als since-Filter
    latest = db.query(func.max(GitCommit.committed_at)).scalar()
    since = (latest.isoformat() + "Z") if latest else None

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Alle Repos holen
        repos_resp = await client.get(
            f"{GITHUB_API}/users/{GITHUB_USERNAME}/repos",
            params={"per_page": 100, "sort": "pushed"},
            headers=HEADERS,
        )
        if repos_resp.status_code != 200:
            logger.warning(f"GitHub Repos API Fehler: {repos_resp.status_code}")
            _last_sync = now
            return

        repos = repos_resp.json()

        # 2. Pro Repo Commits holen
        for repo in repos:
            repo_name = repo.get("name", "")
            if repo.get("fork"):
                continue  # Forks überspringen

            params: dict = {"per_page": 100, "author": GITHUB_USERNAME}
            if since:
                params["since"] = since

            try:
                commits_resp = await client.get(
                    f"{GITHUB_API}/repos/{GITHUB_USERNAME}/{repo_name}/commits",
                    params=params,
                    headers=HEADERS,
                )
                if commits_resp.status_code != 200:
                    continue

                for c in commits_resp.json():
                    sha = c.get("sha", "")
                    if not sha:
                        continue
                    # Deduplizierung
                    if db.query(GitCommit).filter(GitCommit.sha == sha).first():
                        continue

                    # Commit-Datum extrahieren
                    commit_data = c.get("commit", {})
                    date_str = (
                        commit_data.get("author", {}).get("date")
                        or commit_data.get("committer", {}).get("date")
                    )
                    if not date_str:
                        continue

                    committed_at = datetime.fromisoformat(
                        date_str.replace("Z", "+00:00")
                    )
                    message = commit_data.get("message", "")[:200]
                    author = commit_data.get("author", {}).get("name", "")

                    db.add(GitCommit(
                        sha=sha,
                        repo=repo_name,
                        message=message,
                        committed_at=committed_at,
                        author=author,
                    ))
                    new_count += 1

            except Exception as e:
                logger.warning(f"Fehler bei {repo_name}: {e}")
                continue

    if new_count > 0:
        db.commit()
        logger.info(f"{new_count} neue Commits gespeichert")
    _last_sync = now


@router.get("/commits")
async def get_commits(
    month: str = Query(..., description="Format: YYYY-MM"),
    db: Session = Depends(get_db),
):
    """Tages-Statistiken für einen Monat."""
    await _fetch_commits(db)

    try:
        year, mon = int(month[:4]), int(month[5:7])
    except (ValueError, IndexError):
        return {"error": "Format: YYYY-MM"}

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
                "date": day_key, "count": 0, "repos": set(),
                "first": c.committed_at, "last": c.committed_at,
                "commits": [],
            }
        d = days[day_key]
        d["count"] += 1
        d["repos"].add(c.repo)
        d["last"] = c.committed_at
        d["commits"].append({
            "sha": c.sha[:7], "repo": c.repo,
            "message": c.message,
            "time": c.committed_at.strftime("%H:%M"),
        })

    result = []
    for d in days.values():
        # 15min-Regel: Nur Zeitspannen < 15min zwischen Commits zaehlen
        sorted_times = sorted([c.committed_at for c in commits
                               if c.committed_at.strftime("%Y-%m-%d") == d["date"]])
        active_seconds = 0
        for i in range(1, len(sorted_times)):
            gap = (sorted_times[i] - sorted_times[i - 1]).total_seconds()
            if gap <= 900:  # 15 Minuten = 900 Sekunden
                active_seconds += gap
        hours = active_seconds / 3600
        result.append({
            "date": d["date"], "count": d["count"],
            "repos": sorted(d["repos"]),
            "first_commit": d["first"].isoformat(),
            "last_commit": d["last"].isoformat(),
            "work_hours": round(hours, 1),
            "commits": d["commits"],
        })

    return {"month": month, "days": result}


@router.post("/sync")
async def force_sync(db: Session = Depends(get_db)):
    """Manueller Sync — ignoriert den Stunden-Cache."""
    global _last_sync
    _last_sync = None
    await _fetch_commits(db)
    count = db.query(func.count(GitCommit.id)).scalar()
    return {"synced": True, "total_commits": count}
